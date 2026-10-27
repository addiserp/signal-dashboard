// AddisERP Signals — Donchian 4H alerts to Telegram.
// Runs on GitHub Actions every hour. For each enabled symbol it downloads recent 4H candles,
// replays the Donchian system (same rules as the app's backtest) and sends a Telegram message when
// the LAST CLOSED candle produced: a buy signal, a stop move, or a stop-out.
//
// Environment: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (GitHub secrets)
//              TELEGRAM_CHAT_ID can hold several ids separated by commas: one per person or group
//              MODE = "auto" (default) | "test" (send current status now) | "summary"
//              STATE_FILE (default .alert-state/state.json) — remembers what was already sent
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const D = require("./donchian-core.js");
const cfg = JSON.parse(readFileSync(join(here, "config.json"), "utf8"));
const MODE = (process.env.MODE || "auto").toLowerCase();
// trim spaces / line breaks that sneak in when pasting secrets
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();
const CHATS = [...new Set(CHAT.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const mask = (id) => id.replace(/\d(?=\d{3})/g, "•");
const failedChats = new Map();   // chat id -> reason (reported once at the end)
const DRY = process.env.DRY_RUN === "1";
const STATE_FILE = process.env.STATE_FILE || join(process.cwd(), ".alert-state", "state.json");
const TF_SEC = 4 * 3600;
const now = Math.floor(Date.now() / 1000);

// ---------- data ----------
const UA = { "User-Agent": "Mozilla/5.0 (AddisERP Signals alerts)" };
async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}
function closedOnly(c) { return c.filter((x) => x.t + TF_SEC <= now); }
function openCandle(c) { const x = c[c.length - 1]; return x && x.t + TF_SEC > now ? x : null; }

async function binance(kind, symbol) {
  const urls = kind === "binance-futures"
    ? [`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=600`]
    : [`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=4h&limit=600`,
       `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=600`];
  let err;
  for (const u of urls) {
    try {
      const j = await getJSON(u);
      if (!Array.isArray(j)) throw new Error(j && j.msg ? j.msg : "bad data");
      const all = j.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
      return { closed: closedOnly(all), live: openCandle(all) };
    } catch (e) { err = e; }
  }
  throw err;
}

// Yahoo Finance hourly candles grouped into 4H UTC candles (fallback when Binance blocks the server)
async function yahoo(symbol) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=120d`);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error("no Yahoo data");
  const q = r.indicators.quote[0];
  const out = [];
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v == null)) return;
    const b = Math.floor(ts / TF_SEC) * TF_SEC, L = out[out.length - 1];
    if (L && L.t === b) { L.h = Math.max(L.h, h); L.l = Math.min(L.l, l); L.c = c; }
    else out.push({ t: b, o, h, l, c });
  });
  return { closed: closedOnly(out), live: openCandle(out) };
}

async function candles(sym) {
  const errors = [];
  for (const s of sym.sources) {
    try {
      const d = s.type === "yahoo" ? await yahoo(s.symbol) : await binance(s.type, s.symbol);
      if (d.closed.length < 240) throw new Error(`only ${d.closed.length} candles`);
      return { c: d.closed, live: d.live, source: `${s.type === "yahoo" ? "Yahoo" : "Binance"} ${s.symbol}` };
    } catch (e) { errors.push(`${s.type} ${s.symbol}: ${e.message}`); }
  }
  throw new Error(errors.join(" | "));
}

// ---------- formatting ----------
const fmt = (p) => {
  if (p == null || !isFinite(p)) return "—";
  const a = Math.abs(p);
  return p.toLocaleString("en-US", { minimumFractionDigits: a >= 1000 ? 0 : 2, maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : 5 });
};
const pct = (a, b) => ((a - b) / b * 100).toFixed(2) + "%";
const when = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const eat = (t) => new Date((t + 3 * 3600) * 1000).toISOString().slice(11, 16) + " EAT";
const R = (x) => (x >= 0 ? "+" : "") + x.toFixed(2) + "R";

function sizeLine(entry, stop) {
  if (!cfg.accountUSDT) return "";
  const riskUSDT = cfg.accountUSDT * cfg.riskPct / 100;
  const qty = riskUSDT / Math.abs(entry - stop);
  return `\nSize at ${cfg.riskPct}% of ${fmt(cfg.accountUSDT)} USDT: <b>${qty.toPrecision(3)}</b> units (${fmt(qty * entry)} USDT notional)`;
}

function eventMessage(sym, ev, res, source) {
  const tag = `<b>${sym.name} · 4H Donchian</b>`;
  const closeT = ev.t + TF_SEC;
  if (ev.type === "signal") {
    const side = ev.dir > 0 ? "BUY" : "SELL";
    return `${ev.dir > 0 ? "🟢" : "🔻"} ${tag} — <b>${side} signal</b>
The 4H candle closed at <b>${fmt(ev.price)}</b>, ${ev.dir > 0 ? "above the 20-candle high" : "below the 20-candle low"} (${fmt(ev.level)}).
Enter: market order now (next candle opened ${eat(closeT)})
Stop: <b>${fmt(ev.stop)}</b> (2×ATR, ${pct(ev.stop, ev.price)})${sizeLine(ev.price, ev.stop)}
${sym.tested}
<i>${source} · candle ${when(ev.t)}</i>`;
  }
  if (ev.type === "stop") {
    const open = res.position ? `\nOpen trade: ${R(res.position.openR)} (entry ${fmt(res.position.entry)})` : "";
    return `🔼 ${tag} — <b>move your stop to ${fmt(ev.stop)}</b> (was ${fmt(ev.from)})
New 10-candle ${ev.dir > 0 ? "low" : "high"} after the ${eat(closeT)} close; price ${fmt(ev.price)}.${open}
<i>${source}</i>`;
  }
  if (ev.type === "exit") {
    return `🔴 ${tag} — <b>stop hit at ${fmt(ev.price)}</b>
Trade closed: <b>${R(ev.r)}</b> (entry ${fmt(ev.entry)}). Waiting for the next breakout.
<i>${source} · candle ${when(ev.t)}</i>`;
  }
  return null;
}

function earlyMessage(sym, res, live, source) {
  const closeT = live.t + TF_SEC;
  const mins = Math.max(0, Math.round((closeT - now) / 60));
  return `⚡ <b>${sym.name} · 4H Donchian</b> — <b>breakout forming</b>
Price ${fmt(live.c)} is above the 20-candle high (${fmt(res.hi20)}) while the 4H candle is still open.
It becomes a BUY signal only if the candle <b>closes</b> above ${fmt(res.hi20)} at ${eat(closeT)} (in about ${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60} min).
Don't buy yet — wait for the close message.
<i>${source}</i>`;
}

function statusLine(sym, res, source) {
  const p = res.position;
  if (p) return `• <b>${sym.name}</b>: in a ${p.dir > 0 ? "long" : "short"} since ${when(p.entryT)} — entry ${fmt(p.entry)}, stop <b>${fmt(p.stop)}</b>, now ${fmt(res.last.c)} (${R(p.openR)})`;
  if (res.pending) return `• <b>${sym.name}</b>: signal on the last candle — enter at market, stop ${fmt(res.pending.stop)}`;
  return `• <b>${sym.name}</b>: no trade. Buy signal if a 4H candle closes above <b>${fmt(res.hi20)}</b> (${pct(res.hi20, res.last.c)} away); price ${fmt(res.last.c)}`;
}

// ---------- Telegram ----------
function hintFor(d, status) {
  if (/chat not found/i.test(d)) return "this person hasn't pressed Start in the bot yet, or the id is wrong (get it from @userinfobot)";
  if (/bot was blocked/i.test(d)) return "this person blocked the bot; they need to open it and press Start / Unblock";
  if (/bots can't send messages to bots/i.test(d)) return "that id belongs to a bot; use the person's id from @userinfobot";
  if (/kicked|not a member/i.test(d)) return "the bot was removed from this group; add it back";
  if (/Unauthorized/i.test(d) || status === 401) return "TELEGRAM_BOT_TOKEN is wrong; copy it again from @BotFather";
  return "";
}

// sends to every chat id; one person's problem never stops the others
async function send(text) {
  if (DRY) { console.log("[dry run]\n" + text + "\n"); return; }
  let delivered = 0;
  for (const id of CHATS) {
    if (failedChats.has(id)) continue;
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true }),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ description: e.message }) }));
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { delivered++; continue; }
    const d = j.description || `HTTP ${r.status}`;
    if (r.status === 401) fail(`Telegram refused the bot token (${d}). Copy it again from @BotFather.`);
    failedChats.set(id, `${d}${hintFor(d, r.status) ? " → " + hintFor(d, r.status) : ""}`);
  }
  if (!delivered && failedChats.size === CHATS.length) reportFailures(true);
}

function reportFailures(fatal) {
  if (!failedChats.size) return;
  const lines = [...failedChats].map(([id, why]) => `chat ${mask(id)}: ${why}`);
  if (fatal) fail(`Telegram refused every recipient — ${lines.join(" | ")}`);
  for (const l of lines) console.log(`::warning title=Telegram recipient not reached::${l}`);
}

function fail(msg) {
  console.log(`::error title=Telegram alerts::${msg}`);
  console.error(msg);
  process.exit(1);
}

// ---------- check the Telegram secrets before doing anything ----------
if (!DRY) {
  if (!TOKEN) fail("The TELEGRAM_BOT_TOKEN secret is empty or missing. Add it under Settings → Secrets and variables → Actions → Repository secrets (exact name, all capitals).");
  if (!CHAT) fail("The TELEGRAM_CHAT_ID secret is empty or missing. Add it under Settings → Secrets and variables → Actions → Repository secrets (exact name, all capitals).");
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(TOKEN)) fail("TELEGRAM_BOT_TOKEN doesn't look like a bot token (it should look like 123456789:AA…). Copy it again from @BotFather.");
  const bad = CHATS.filter((id) => !/^-?\d+$/.test(id));
  if (bad.length) fail(`TELEGRAM_CHAT_ID should be numbers separated by commas (like 123456789,987654321), but "${bad[0].slice(0, 3)}…" isn't a number. Get each person's Id from @userinfobot.`);
  const me = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`).then((r) => r.json()).catch((e) => ({ ok: false, description: e.message }));
  if (!me.ok) fail(`Telegram doesn't accept the bot token (${me.description || "unknown error"}). Copy it again from @BotFather.`);
  console.log(`Telegram bot: @${me.result.username} · sending to ${CHATS.length} recipient(s): ${CHATS.map(mask).join(", ")}`);
}

// ---------- main ----------
function loadState() { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { sent: {}, summaryDay: "" }; } }
function saveState(s) {
  const cutoff = now - 45 * 86400;
  for (const [k, t] of Object.entries(s.sent)) if (t < cutoff) delete s.sent[k];
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

const state = loadState();
const status = [], problems = [];
let sentCount = 0;
for (const sym of cfg.symbols.filter((s) => s.enabled)) {
  let data;
  try { data = await candles(sym); }
  catch (e) { problems.push(`${sym.name}: ${e.message}`); console.error(`${sym.name}: ${e.message}`); continue; }
  const res = D.replay(data.c, { sides: sym.sides || "long" });
  status.push(statusLine(sym, res, data.source));
  const lastK = data.c.length - 1;
  const fresh = now - (res.last.t + TF_SEC) < 8 * 3600;        // ignore stale data
  console.log(`${sym.name}: ${data.c.length} candles from ${data.source}, last closed ${when(res.last.t)}${fresh ? "" : " (stale)"}`);
  if (MODE !== "auto" || !fresh) continue;
  // early warning: the live (still open) candle is above the breakout level — once per candle
  if (cfg.earlyWarning !== false && data.live && !res.position && !res.pending && data.live.h > res.hi20 && data.live.c > res.hi20) {
    const key = `${sym.name}|early|${data.live.t}`;
    if (!state.sent[key]) { await send(earlyMessage(sym, res, data.live, data.source)); state.sent[key] = now; sentCount++; }
  }
  for (const ev of res.events.filter((e) => e.k === lastK && ["signal", "stop", "exit"].includes(e.type))) {
    if (ev.type === "stop" && !cfg.stopUpdates) continue;
    const key = `${sym.name}|${ev.type}|${ev.t}`;
    if (state.sent[key]) continue;
    const msg = eventMessage(sym, ev, res, data.source);
    if (!msg) continue;
    await send(msg);
    state.sent[key] = now; sentCount++;
  }
}

const today = new Date().toISOString().slice(0, 10);
const hourUTC = new Date().getUTCHours();
const wantSummary = MODE === "test" || MODE === "summary" || (MODE === "auto" && hourUTC === cfg.dailySummaryHourUTC && state.summaryDay !== today);
if (wantSummary) {
  const head = MODE === "test" ? "✅ <b>AddisERP Signals alerts are working</b>" : "☀️ <b>Daily status · 4H Donchian</b>";
  const body = status.length ? status.join("\n") : "No symbol could be loaded.";
  const warn = problems.length ? `\n\n⚠️ ${problems.join("\n⚠️ ")}` : "";
  await send(`${head}\n${body}${warn}\n<i>Not financial advice.</i>`);
  if (MODE === "auto") state.summaryDay = today;
  sentCount++;
}
saveState(state);
reportFailures(false);
if (MODE === "test" && !DRY) console.log(`test message delivered to ${CHATS.length - failedChats.size} of ${CHATS.length} recipient(s)`);
console.log(`done — ${sentCount} message(s) sent${problems.length ? `, ${problems.length} symbol(s) failed` : ""}`);
if (problems.length && !status.length) process.exit(1);
