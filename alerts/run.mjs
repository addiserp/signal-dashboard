// Addis Chart Signals — 4H alerts to Telegram.
// System "filters" (default): BUY when Trend lines + Volume + Oscillators agree on a closed 4H candle,
// ⭐ A+ when the 1D Structure agrees too. Stop 2×ATR, trailed to the 10-candle low.
// System "donchian": the older Donchian breakout (set "system": "donchian" in config.json).
// Runs on GitHub Actions (every 15 min when triggered by cron-job.org; GitHub's own schedule is often
// hours late). For each enabled symbol it downloads recent 4H candles, replays the Donchian system
// (same rules as the app's backtest) and sends a Telegram message for every signal, stop move or
// stop-out since the previous run — so a late run catches up instead of silently skipping events.
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
const F = require("./dfilters.js");
const SYSTEM = cfg.system || "filters";
const bits = (names) => (names || []).reduce((m, n) => { const b = F.KEYS.indexOf(n); if (b < 0) throw new Error(`unknown filter "${n}" in config.json (use ${F.KEYS.join(", ")})`); return m | (1 << b); }, 0);
const NEED = bits(cfg.filters || ["rays", "volume", "osc"]), PLUS = bits(cfg.aplus || ["structure"]);
const NEED_NAMES = F.KEYS.filter((k, b) => NEED & (1 << b)).map((k) => F.FILTERS[k].name);
const SYS_NAME = SYSTEM === "filters" ? "4H Filters" : "4H Donchian";
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
const COST = { feePct: cfg.feePct == null ? 0.05 : cfg.feePct, fundingPct: cfg.fundingPct == null ? 0.01 : cfg.fundingPct };
const LIVE_SINCE = Math.floor(Date.parse((cfg.liveSince || "2026-10-27") + "T00:00:00Z") / 1000);
const now = Math.floor(Date.now() / 1000);

// ---------- data ----------
const UA = { "User-Agent": "Mozilla/5.0 (Addis Chart Signals alerts)" };
async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}
function closedOnly(c) { return c.filter((x) => x.t + TF_SEC <= now); }
function openCandle(c) { const x = c[c.length - 1]; return x && x.t + TF_SEC > now ? x : null; }

async function binance(kind, symbol) {
  const urls = kind === "binance-futures"
    ? [`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=1500`]
    : [`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=4h&limit=1000`,
       `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=1000`];
  let err;
  for (const u of urls) {
    try {
      const j = await getJSON(u);
      if (!Array.isArray(j)) throw new Error(j && j.msg ? j.msg : "bad data");
      const all = j.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
      if (SYSTEM === "filters") {
        const du = u.replace("interval=4h", "interval=1d").replace(/limit=\d+/, "limit=500");
        const dj = await getJSON(du);
        const day = dj.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })).filter((x) => x.t + 86400 <= now);
        return { closed: closedOnly(all), live: openCandle(all), daily: day };
      }
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
  const out = [], day = [];
  const group = (arr, sec, ts, o, h, l, c, v) => {
    const b = Math.floor(ts / sec) * sec, L = arr[arr.length - 1];
    if (L && L.t === b) { L.h = Math.max(L.h, h); L.l = Math.min(L.l, l); L.c = c; L.v += v; }
    else arr.push({ t: b, o, h, l, c, v });
  };
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = (q.volume && q.volume[i]) || 0;
    if ([o, h, l, c].some((x) => x == null)) return;
    group(out, TF_SEC, ts, o, h, l, c, v); group(day, 86400, ts, o, h, l, c, v);
  });
  return { closed: closedOnly(out), live: openCandle(out), daily: day.filter((x) => x.t + 86400 <= now) };
}

// 200-day average of a daily reference series (gold: Binance spot PAXGUSDT, reachable from GitHub's servers)
async function trend200(ref) {
  const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${ref}&interval=1d&limit=400`);
  if (!Array.isArray(j)) throw new Error("no daily data for " + ref);
  const d = j.map((k) => ({ t: Math.floor(k[0] / 1000), c: +k[4] })).filter((x) => x.t + 86400 <= now);
  const sma = []; let sum = 0;
  d.forEach((x, i) => { sum += x.c; if (i >= 200) sum -= d[i - 200].c; sma.push(i >= 199 ? sum / 200 : null); });
  // state known at time t: the last daily candle that had closed by then
  const at = (t) => { let a = -1; for (let i = d.length - 1; i >= 0; i--) if (d[i].t + 86400 <= t) { a = i; break; } return a >= 0 && sma[a] != null ? { above: d[a].c > sma[a], close: d[a].c, sma: sma[a] } : null; };
  return { at, ref };
}

async function candles(sym) {
  const errors = [];
  for (const s of sym.sources) {
    try {
      const d = s.type === "yahoo" ? await yahoo(s.symbol) : await binance(s.type, s.symbol);
      if (d.closed.length < 240) throw new Error(`only ${d.closed.length} candles`);
      return { c: d.closed, live: d.live, daily: d.daily, source: `${s.type === "yahoo" ? "Yahoo" : "Binance"} ${s.symbol}` };
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

function sizeLine(entry, stop, dir = 1) {
  if (!cfg.accountUSDT) return "\n<i>Tip: set accountUSDT in alerts/config.json to get the position size here.</i>";
  const lev = cfg.leverage || 1;
  const z = D.size({ account: cfg.accountUSDT, riskPct: cfg.riskPct, entry, stop, leverage: lev, dir });
  if (!z) return "";
  let line = `\nSize at ${cfg.riskPct}% risk of ${fmt(cfg.accountUSDT)} USDT: <b>${z.qty.toPrecision(3)}</b> units = ${fmt(z.notional)} USDT`;
  if (lev > 1) line += ` · margin ${fmt(z.margin)} USDT at ${lev}×`;
  if (z.liqBeforeStop) line += `\n⚠️ At ${lev}× you would be liquidated (≈${fmt(z.liq)}) before the stop — use lower leverage.`;
  else if (z.tooBig) line += `\n⚠️ The margin is more than your account — use more leverage or a smaller risk %.`;
  return line;
}

// ---------- paper-trading ledger (survives beyond the candle window) ----------
function recordPaper(state, sym, res) {
  state.ledger = state.ledger || {};
  for (const t of res.trades) {
    if (t.t < LIVE_SINCE) continue;
    state.ledger[`${sym.name}|${SYSTEM}|${t.t}`] = { sym: sym.name, sys: SYSTEM, dir: t.dir, t: t.t, exitT: t.exitT, entry: t.entry, stop0: t.stop0, exit: t.exit, net: D.netR(t, COST) };
  }
}
function paperOf(state, name) {
  const trades = Object.values(state.ledger || {}).filter((x) => x.sym === name && (x.sys || "donchian") === SYSTEM);
  const total = trades.reduce((a, x) => a + x.net, 0);
  return { n: trades.length, wins: trades.filter((x) => x.net > 0).length, total };
}
const sinceText = new Date(LIVE_SINCE * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const ago = (t) => { const m = Math.max(0, Math.round((now - t) / 60)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`; };
const LATE_SEC = 45 * 60;   // an alert more than 45 min after the candle close is marked late
const CHASE_R = 0.5;        // a late entry is OK only within 0.5R of the signal price

// what to do now with a signal that is reported late
function lateSignalAdvice(ev, res, livePrice) {
  const entryT = ev.t + TF_SEC;
  const p = res.position && res.position.entryT === entryT ? res.position : null;
  const done = res.trades.find((x) => x.t === entryT);
  if (done) return `\n⏹ <b>Already over:</b> this trade was stopped out at ${fmt(done.exit)} (${R(done.r)}). Nothing to do.`;
  if (!p) return `\n⏹ <b>Skip:</b> the next candle opened beyond the stop, so the system didn't take this trade.`;
  const risk = Math.abs(ev.price - ev.stop);
  const px = livePrice != null ? livePrice : res.last.c;
  const moved = p.dir * (px - ev.price) / risk;
  const where = `Price now ${fmt(px)} (${moved >= 0 ? "+" : ""}${moved.toFixed(2)}R from the signal), current stop <b>${fmt(p.stop)}</b>.`;
  if (moved > CHASE_R) return `\n🚫 <b>Don't chase:</b> ${where} Too far from the entry — wait for the next signal.`;
  if (p.dir > 0 ? px <= p.stop : px >= p.stop) return `\n🚫 <b>Don't enter:</b> ${where} Price is already at the stop.`;
  return `\n✅ <b>Still OK to enter:</b> ${where}`;
}

const tick = (ok) => ok ? "✅" : "❌";
function checksLine(ck) {
  const main = F.KEYS.filter((k, b) => NEED & (1 << b)).map((k) => `${tick(ck[k])} ${F.FILTERS[k].name}`).join(" · ");
  const plus = F.KEYS.filter((k, b) => PLUS & (1 << b)).map((k) => `${tick(ck[k])} ${F.FILTERS[k].name}`).join(" · ");
  return main + (plus ? `\nA+ check: ${plus}` : "");
}
function eventMessage(sym, ev, res, source, livePrice) {
  const tag = `<b>${sym.name} · ${SYS_NAME}</b>`;
  const closeT = ev.t + TF_SEC;
  const late = now - closeT > LATE_SEC;
  const lateHead = late ? `⏰ <b>Late alert</b> — the 4H candle closed at ${eat(closeT)}, ${ago(closeT)} ago.\n` : "";
  if (ev.type === "signal" && SYSTEM === "filters") {
    const side = ev.dir > 0 ? "BUY" : "SELL";
    const short = ev.dir < 0 ? `\n⚠️ Short trades tested weaker — long only is the tested system.` : "";
    const head = ev.aplus ? `⭐ <b>A+ ${side} setup</b> — all filters agree, including the 1D structure` : `<b>${side} signal</b> — ${NEED_NAMES.join(" + ")} agree`;
    return `${lateHead}${ev.dir > 0 ? "🟢" : "🔻"} ${tag} — ${head}
${checksLine(ev.checks)}
Close <b>${fmt(ev.price)}</b> · oscillators ${F.oscLabel(ev.checks.oscRating)}
${late ? `Planned entry: next candle open at ${eat(closeT)}` : `Enter: market order now (next candle opened ${eat(closeT)})`}
Stop: <b>${fmt(ev.stop)}</b> (2×ATR, ${pct(ev.stop, ev.price)}), then trail to the 10-candle low${sizeLine(ev.price, ev.stop, ev.dir)}${late ? lateSignalAdvice(ev, res, livePrice) : ""}${short}
${ev.trend ? `📈 Above its 200-day average (${fmt(ev.trend.close)} vs ${fmt(ev.trend.sma)}) ✅\n` : ""}${sym.watchOnly ? `👀 <b>Watch-only:</b> ${sym.watchOnly}\n` : ""}${sym.tested ? `Backtest ${sym.tested.replace(/^Backtest /, "")}` : ""}
<i>${source} · candle ${when(ev.t)}</i>`;
  }
  if (ev.type === "signal") {
    const side = ev.dir > 0 ? "BUY" : "SELL";
    const short = ev.dir < 0 ? `\n⚠️ Short trades were not backtested positive — long only is the tested system.` : "";
    return `${lateHead}${ev.dir > 0 ? "🟢" : "🔻"} ${tag} — <b>${side} signal</b>
The 4H candle closed at <b>${fmt(ev.price)}</b>, ${ev.dir > 0 ? "above the 20-candle high" : "below the 20-candle low"} (${fmt(ev.level)}).
${late ? `Planned entry: next candle open at ${eat(closeT)}` : `Enter: market order now (next candle opened ${eat(closeT)})`}
Stop: <b>${fmt(ev.stop)}</b> (2×ATR, ${pct(ev.stop, ev.price)})${sizeLine(ev.price, ev.stop, ev.dir)}${late ? lateSignalAdvice(ev, res, livePrice) : ""}${short}
${sym.tested}
<i>${source} · candle ${when(ev.t)}</i>`;
  }
  if (ev.type === "stop") {
    const open = res.position ? `\nOpen trade: ${R(res.position.openR)} (entry ${fmt(res.position.entry)})` : "";
    return `${lateHead}🔼 ${tag} — <b>move your stop to ${fmt(ev.stop)}</b> (was ${fmt(ev.from)})
New 10-candle ${ev.dir > 0 ? "low" : "high"} after the ${eat(closeT)} close; price ${fmt(ev.price)}.${open}
<i>${source}</i>`;
  }
  if (ev.type === "exit") {
    const tr = res.trades.find((x) => x.exitT === ev.t);
    const net = tr ? D.netR(tr, COST) : ev.r;
    const p = paperOf(state, sym.name);
    return `${lateHead}🔴 ${tag} — <b>stop hit at ${fmt(ev.price)}</b>
Trade closed: <b>${R(net)}</b> after fees and funding (${R(ev.r)} before), entry ${fmt(ev.entry)}. Waiting for the next ${SYSTEM === "filters" ? "signal" : "breakout"}.
📒 Paper trading since ${sinceText}: ${p.n} trade${p.n === 1 ? "" : "s"}, ${p.wins} win${p.wins === 1 ? "" : "s"}, <b>${R(p.total)}</b>
<i>${source} · candle ${when(ev.t)}</i>`;
  }
  return null;
}

function earlyMessage(sym, res, live, source) {
  const closeT = live.t + TF_SEC;
  const mins = Math.max(0, Math.round((closeT - now) / 60));
  return `⚡ <b>${sym.name} · ${SYS_NAME}</b> — <b>breakout forming</b>
Price ${fmt(live.c)} is above the 20-candle high (${fmt(res.hi20)}) while the 4H candle is still open.
It becomes a BUY signal only if the candle <b>closes</b> above ${fmt(res.hi20)} at ${eat(closeT)} (in about ${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60} min).
Don't buy yet — wait for the close message.
<i>${source}</i>`;
}

function statusLine(sym, res, source) {
  const p = res.position;
  if (SYSTEM === "filters" && !p && !res.pending) {
    const ck = res.now;
    if (res.trendNow && !res.trendNow.above) return `• <b>${sym.name}</b>: no trade, price ${fmt(res.last.c)}. Below its 200-day average (${fmt(res.trendNow.sma)}) — no signals until it's back above.`;
    const n = F.KEYS.filter((k, b) => NEED & (1 << b)).filter((k) => ck[k]).length;
    return `• <b>${sym.name}</b>: no trade, price ${fmt(res.last.c)}. Filters now: ${F.KEYS.filter((k, b) => (NEED | PLUS) & (1 << b)).map((k) => `${tick(ck[k])} ${F.FILTERS[k].name}`).join(" · ")} (${n}/${NEED_NAMES.length} needed agree)`;
  }
  if (p) return `• <b>${sym.name}</b>: ${p.aplus ? "⭐ A+ " : ""}in a ${p.dir > 0 ? "long" : "short"} since ${when(p.entryT)} — entry ${fmt(p.entry)}, stop <b>${fmt(p.stop)}</b>, now ${fmt(res.last.c)} (${R(p.openR)})`;
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
const status = [], problems = [], opens = {};
let sentCount = 0;
for (const sym of cfg.symbols.filter((s) => s.enabled)) {
  let data;
  try { data = await candles(sym); }
  catch (e) { problems.push(`${sym.name}: ${e.message}`); console.error(`${sym.name}: ${e.message}`); continue; }
  let res;
  if (SYSTEM === "filters") {
    if (!data.daily || data.daily.length < 40) { problems.push(`${sym.name}: not enough daily candles for the filters`); continue; }
    const X = F.context({ "4h": data.c, "1d": data.daily }, "4h");
    let allow = null, T2 = null;
    if (sym.trend200) {
      try { T2 = await trend200(sym.trend200); allow = (k) => { const st = T2.at(data.c[k].t + TF_SEC); return !!(st && st.above); }; }
      catch (e) { problems.push(`${sym.name}: 200-day check failed (${e.message}) — no signals this run`); allow = () => false; }
    }
    res = F.replayFilters(X, { need: NEED, plus: PLUS, sides: sym.sides || "long", allow });
    if (T2) { res.trendNow = T2.at(now); for (const ev of res.events) if (ev.type === "signal") ev.trend = T2.at(ev.t + TF_SEC); }
  } else res = D.replay(data.c, { sides: sym.sides || "long" });
  recordPaper(state, sym, res);
  status.push(statusLine(sym, res, data.source));
  opens[sym.name] = res.position && res.position.entryT >= LIVE_SINCE ? D.netR({ dir: res.position.dir, entry: res.position.entry, stop0: res.position.stop0, t: res.position.entryT, exit: res.last.c, exitT: res.last.t }, COST) : null;
  const lastK = data.c.length - 1;
  const fresh = now - (res.last.t + TF_SEC) < 8 * 3600;        // ignore stale data
  console.log(`${sym.name}: ${data.c.length} candles from ${data.source}, last closed ${when(res.last.t)}${fresh ? "" : " (stale)"}`);
  if (MODE !== "auto" || !fresh) continue;
  // early warning: the live (still open) candle is above the breakout level — once per candle
  if (SYSTEM !== "filters" && cfg.earlyWarning !== false && data.live && !res.position && !res.pending && data.live.h > res.hi20 && data.live.c > res.hi20) {
    const key = `${sym.name}|early|${data.live.t}`;
    if (!state.sent[key]) { await send(earlyMessage(sym, res, data.live, data.source)); state.sent[key] = now; sentCount++; }
  }
  // every event since the previous run (first run: only the last candle). Capped at 3 days.
  state.lastT = state.lastT || {};
  const fromT = Math.max(state.lastT[sym.name] != null ? state.lastT[sym.name] + 1 : res.last.t, now - 3 * 86400);
  const evs = res.events.filter((e) => e.t >= fromT && ["signal", "stop", "exit"].includes(e.type));
  state.lastT[sym.name] = res.last.t;
  for (const ev of evs) {
    if (ev.type === "stop" && !cfg.stopUpdates) continue;
    // stop moves: only the newest one still matters, and none once the trade is closed
    if (ev.type === "stop" && evs.some((e) => e.t > ev.t && (e.type === "stop" || e.type === "exit"))) continue;
    const key = `${sym.name}|${ev.type}|${ev.t}`;
    if (state.sent[key]) continue;
    const msg = eventMessage(sym, ev, res, data.source, data.live ? data.live.c : null);
    if (!msg) continue;
    await send(msg);
    state.sent[key] = now; sentCount++;
  }
}

const today = new Date().toISOString().slice(0, 10);
const hourUTC = new Date().getUTCHours();
const wantSummary = MODE === "test" || MODE === "summary" || (MODE === "auto" && hourUTC >= cfg.dailySummaryHourUTC && state.summaryDay !== today);
if (wantSummary) {
  const head = MODE === "test" ? "✅ <b>Addis Chart Signals alerts are working</b>" : "☀️ <b>Daily status · ${SYS_NAME}</b>";
  const body = status.length ? status.join("\n") : "No symbol could be loaded.";
  // paper-trading scorecard (net of fees and funding)
  const names = cfg.symbols.filter((s) => s.enabled).map((s) => s.name);
  let all = 0, n = 0, w = 0;
  const rows = names.map((nm) => {
    const p = paperOf(state, nm); all += p.total; n += p.n; w += p.wins;
    const o = opens[nm] != null ? ` · open ${R(opens[nm])}` : "";
    return `• ${nm}: ${p.n} closed${p.n ? `, ${p.wins} win${p.wins === 1 ? "" : "s"}, ${R(p.total)}` : ""}${o}`;
  });
  const acct = cfg.riskPct ? ` ≈ ${(all * cfg.riskPct).toFixed(1)}% of the account at ${cfg.riskPct}% risk` : "";
  const score = `\n\n📒 <b>Paper trading since ${sinceText}</b> (after fees + funding)\n${rows.join("\n")}\nTotal: <b>${R(all)}</b> over ${n} closed trade${n === 1 ? "" : "s"}${n ? acct : ""}`;
  const warn = problems.length ? `\n\n⚠️ ${problems.join("\n⚠️ ")}` : "";
  await send(`${head}\n${body}${score}${warn}\n<i>Not financial advice.</i>`);
  if (MODE === "auto") state.summaryDay = today;
  sentCount++;
}
saveState(state);
reportFailures(false);
if (MODE === "test" && !DRY) console.log(`test message delivered to ${CHATS.length - failedChats.size} of ${CHATS.length} recipient(s)`);
console.log(`done — ${sentCount} message(s) sent${problems.length ? `, ${problems.length} symbol(s) failed` : ""}`);
if (problems.length && !status.length) process.exit(1);
