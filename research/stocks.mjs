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
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

async function yahoo(sym, interval, qs) {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&${qs}&includePrePost=false`, { headers: UA });
      if (!r.ok) { console.log(`  yahoo ${sym} ${interval}: HTTP ${r.status}`); continue; }
      const j = await r.json(), res = j.chart.result[0], q = res.indicators.quote[0];
      return res.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 })).filter((x) => x.o != null && x.c != null && x.h != null && x.l != null);
    } catch (e) { console.log(`  yahoo ${sym} ${interval}: ${e.message}`); }
  }
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
async function binance(sym, interval) {
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}USDT&interval=${interval}&limit=1500`);
    if (!r.ok) return `HTTP ${r.status}`;
    const k = await r.json();
    return k.length ? `${k.length} candles from ${new Date(k[0][0]).toISOString().slice(0, 10)}` : "no data";
  } catch (e) { return e.message; }
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
  console.log(`  Binance ${sym}USDT contract: 1h ${await binance(sym, "1h")} · 4h ${await binance(sym, "4h")}`);
  // Part 1 — the last ~2 years (first ~3 months of hourly data are warm-up)
  test("PART 1 · 1H", "1h", h1, d1, h1.length ? h1[Math.min(h1.length - 1, 210)].t : 0);
  test("PART 1 · 4H", "4h", to4h(h1), d1, 0);
  // Part 2 — daily since 2015 (2013–14 is warm-up)
  test("PART 2 · 1D", "1d", d1, d1, T(2015), [["2015-19", T(2015), T(2020)], ["2020-22", T(2020), T(2023)], ["2023-now", T(2023), Infinity]]);
}
console.log("\n======== ALL STOCKS TOGETHER (KO = control) ========");
for (const [k, tr] of Object.entries(tot)) console.log(`  ${k.padEnd(42)} ${fmt(F.summarize(tr, 1))}`);

// random prices, stock-like settings: what the rule shows when there are no real trends
function rw(n, seed, sec) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 100, t = T(2015);
  for (let i = 0; i < n; i++) { const o = p * Math.exp(0.003 * g()); p = o * Math.exp(0.015 * g()); out.push({ t, o, h: Math.max(o, p) * (1 + Math.abs(g()) * 0.004), l: Math.min(o, p) * (1 - Math.abs(g()) * 0.004), c: p, v: 1e6 * Math.exp(0.5 * g()) }); t += sec; }
  return out;
}
console.log("\n======== Random-walk check (16 × 3,000 daily candles) ========");
const nul = {};
for (let k = 0; k < 16; k++) {
  const d = rw(3000, 11 + k * 97, 86400), X = F.context({ "1d": d }, "1d");
  for (const [name, need] of VARS) (nul[name] = nul[name] || []).push(...F.runDonchian(X, { ...OPTS, startT: d[250].t }, need));
}
for (const [name, tr] of Object.entries(nul)) console.log(`  ${name.padEnd(27)} ${fmt(F.summarize(tr, 1))}`);
