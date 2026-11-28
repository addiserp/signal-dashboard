// Research: the addis-4H rule on US stocks.
// Part 1: 1H and 4H, last ~2 years (Yahoo 1-hour bars, regular session; 4H = 9:30–13:30 + 13:30–16:00 ET like TradingView). Binance stock contracts checked too.
// Part 2: 1D since 2015 (Yahoo daily, split-adjusted).
// Buys only (the live rule for stocks), fee 0.02% per side, no funding, stop 2×ATR trailed to the 10-candle low, 1% risk per trade.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./dfilters16.js");
const SYMS = (process.env.SYMS || "QQQ,NVDA,META,TSLA,AMD,MSTR,AAPL,KO").split(",");
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const RULE = B.rays | B.volume | B.osc;
const VARS = [["Plain Donchian", 0], ["Donchian + TL + Vol + Osc", RULE], ["  … + 50-day average", RULE | B.above50]];
const OPTS = { sides: "long", feePct: 0.02, fundingPct: 0 };
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let YH = null;
async function yAuth() {
  if (YH) return YH;
  try {
    const c = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
    const cookie = (c.headers.get("set-cookie") || "").split(";")[0];
    const cr = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, Cookie: cookie } });
    YH = { cookie, crumb: cr.ok ? await cr.text() : "" };
  } catch { YH = { cookie: "", crumb: "" }; }
  return YH;
}
async function yahoo(sym, interval, qs) {
  const A = await yAuth();
  for (let attempt = 0; attempt < 6; attempt++) {
    const host = attempt % 2 ? "query1" : "query2";
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&${qs}&includePrePost=false${A.crumb ? "&crumb=" + encodeURIComponent(A.crumb) : ""}`, { headers: { ...UA, ...(A.cookie ? { Cookie: A.cookie } : {}) } });
      if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
      if (!r.ok) { console.log(`  yahoo ${sym} ${interval}: HTTP ${r.status}`); await sleep(2000); continue; }
      const j = await r.json(), res = j.chart.result[0], q = res.indicators.quote[0];
      await sleep(1500);
      return res.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 })).filter((x) => x.o != null && x.c != null && x.h != null && x.l != null);
    } catch (e) { console.log(`  yahoo ${sym} ${interval}: ${e.message}`); await sleep(3000); }
  }
  console.log(`  yahoo ${sym} ${interval}: gave up`);
  return [];
}
// daily bars dated 00:00 UTC of the trading day → "known" from the next 00:00 UTC, after the 16:00 ET close (no peeking)
const dayUTC = (t) => Math.floor(t / 86400) * 86400;
async function daily(sym, fromY) { return (await yahoo(sym, "1d", `period1=${Math.floor(Date.UTC(fromY, 0, 1) / 1000)}&period2=${Math.floor(Date.now() / 1000)}`)).map((x) => ({ ...x, t: dayUTC(x.t) })); }
// 1H bars → 4H: per session the first 4 hourly bars (9:30–13:30) and the rest (13:30–16:00)
function to4h(h1) {
  const days = new Map();
  for (const x of h1) { const d = dayUTC(x.t - 4 * 3600); if (!days.has(d)) days.set(d, []); days.get(d).push(x); }
  const out = [];
  for (const bars of days.values()) for (const g of [bars.slice(0, 4), bars.slice(4)]) if (g.length)
    out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1].c, v: g.reduce((a, x) => a + x.v, 0) });
  return out;
}
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
async function binance(sym, interval) {   // Binance USDⓈ-M stock contract, monthly files from data.binance.vision
  try {
    const list = await (await fetch(`https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/monthly/klines/${sym}USDT/${interval}/`)).text();
    const keys = [...list.matchAll(/<Key>([^<]+\.zip)<\/Key>/g)].map((m) => m[1]);
    if (!keys.length) return [];
    const dir = mkdtempSync("/tmp/bv"), out = [];
    for (const k of keys) {
      const r = await fetch("https://data.binance.vision/" + k); if (!r.ok) continue;
      writeFileSync(dir + "/f.zip", Buffer.from(await r.arrayBuffer()));
      const csv = execSync(`unzip -p ${dir}/f.zip`).toString();
      for (const line of csv.split("\n")) { const p = line.split(","); if (!/^\d+$/.test(p[0])) continue; out.push({ t: Math.floor(+p[0] / 1000), o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[5] }); }
    }
    rmSync(dir, { recursive: true, force: true });
    const seen = new Set(); return out.sort((a, b) => a.t - b.t).filter((x) => !seen.has(x.t) && seen.add(x.t));
  } catch (e) { console.log("  binance", sym, e.message); return []; }
}
const fmt = (s) => s && s.n ? `${String(s.n).padStart(4)} tr  win ${(s.winRate * 100).toFixed(0).padStart(2)}%  ${(s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(2)}R  ret ${(s.ret >= 0 ? "+" : "") + s.ret.toFixed(0)}%  DD ${s.dd.toFixed(0)}%` : "   0 tr";
const pct = (a, b) => ((b / a - 1) * 100).toFixed(0) + "%";
const tot = {};
function test(label, tf, c, d1, startT, splits) {
  if (c.length < 300) { console.log(`  ${label}: only ${c.length} candles — skipped`); return; }
  const X = F.context({ [tf]: c, "1d": d1 }, tf);
  const c0 = c.find((x) => x.t >= startT) || c[210];
  console.log(`  ${label}: ${c.length} candles ${new Date(c[0].t * 1000).toISOString().slice(0, 10)} → ${new Date(c[c.length - 1].t * 1000).toISOString().slice(0, 10)} · buy & hold ${pct(c0.o, c[c.length - 1].c)}`);
  for (const [name, need] of VARS) {
    const tr = F.runDonchian(X, { ...OPTS, startT }, need), s = F.summarize(tr, 1);
    const key = `${label}|${name}`; (tot[key] = tot[key] || []).push(...tr);
    let line = `    ${name.padEnd(27)} ${fmt(s)}`;
    if (splits) line += "   (" + splits.map(([lab, a, b]) => { const z = F.summarize(tr.filter((t) => t.t >= a && t.t < b), 1); return `${lab} ${z.n ? (z.avgR >= 0 ? "+" : "") + z.avgR.toFixed(2) + "R/" + z.n : "—"}`; }).join(" · ") + ")";
    console.log(line);
  }
}
const T = (y) => Date.UTC(y, 0, 1) / 1000;
for (const sym of SYMS) {
  console.log(`\n======== ${sym} ========`);
  const d1 = await daily(sym, 2013);
  const h1 = await yahoo(sym, "60m", "range=730d");
  // Part 1 — the last ~2 years (first ~3 months of hourly data are warm-up)
  const bh = await binance(sym, "1h"), b4 = await binance(sym, "4h");
  console.log(`  Binance ${sym}USDT stock contract: ${bh.length ? bh.length + " 1h candles from " + new Date(bh[0].t * 1000).toISOString().slice(0, 10) : "not listed"}`);
  if (bh.length >= 300) test("PART 1 · Binance 1H (24/7)", "1h", bh, d1, bh[Math.min(bh.length - 1, 210)].t);
  if (b4.length >= 300) test("PART 1 · Binance 4H (24/7)", "4h", b4, d1, 0);
  test("PART 1 · 1H", "1h", h1, d1, h1.length ? h1[Math.min(h1.length - 1, 210)].t : 0);
  test("PART 1 · 4H", "4h", to4h(h1), d1, 0);
  // Part 2 — daily since 2015 (2013–14 is warm-up)
  test("PART 2 · 1D", "1d", d1, d1, T(2015), [["2015-19", T(2015), T(2020)], ["2020-22", T(2020), T(2023)], ["2023-now", T(2023), Infinity]]);
}
console.log("\n======== ALL STOCKS TOGETHER (KO = control) ========");
for (const [k, tr] of Object.entries(tot)) console.log(`  ${k.padEnd(42)} ${fmt(F.summarize(tr, 1))}`);

// random prices: candles built from a fine price path (real highs/lows) with a good random generator
function rw(n, seed, sec, sub = 48) {
  let a = seed >>> 0; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 100, t = T(2015); const sd = 0.015 / Math.sqrt(sub);
  for (let i = 0; i < n; i++) { const o = p; let h = p, l = p; for (let j = 0; j < sub; j++) { p *= Math.exp(sd * g()); h = Math.max(h, p); l = Math.min(l, p); } out.push({ t, o, h, l, c: p, v: 1e6 * Math.exp(0.5 * g()) }); t += sec; }
  return out;
}
console.log("\n======== Random-price check (32 × 3,000 daily candles, no real trends) ========");
const nul = {};
for (let k = 0; k < 32; k++) {
  const d = rw(3000, 11 + k * 97, 86400), X = F.context({ "1d": d }, "1d");
  for (const [name, need] of VARS) (nul[name] = nul[name] || []).push(...F.runDonchian(X, { ...OPTS, startT: d[250].t }, need));
}
for (const [name, tr] of Object.entries(nul)) console.log(`  ${name.padEnd(27)} ${fmt(F.summarize(tr, 1))}`);
