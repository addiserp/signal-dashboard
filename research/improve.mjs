// Research: ways to improve the old addis-4H rule (Trend lines + Volume + Oscillators).
// Entry filters and exit settings, each judged on 4 symbols, two periods, and against random-walk prices.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./dfilters.js");
const bases = ["https://data-api.binance.vision/api/v3/klines", "https://api.binance.com/api/v3/klines"];
async function klines(sym, interval, startMs) {
  const out = []; let end = Date.now();
  for (let guard = 0; guard < 200; guard++) {
    let page = null;
    for (const b of bases) { try { const r = await fetch(`${b}?symbol=${sym}&interval=${interval}&limit=1000&endTime=${end}`); if (r.ok) { page = await r.json(); break; } } catch {} }
    if (!page || !page.length) break;
    out.unshift(...page.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })));
    if (page[0][0] <= startMs || page.length < 1000) break;
    end = page[0][0] - 1;
  }
  const seen = new Set(); return out.filter((x) => !seen.has(x.t) && seen.add(x.t) && x.t * 1000 >= startMs);
}
function vwapHigh(c) {
  const n = c.length, P = new Float64Array(n + 1), V = new Float64Array(n + 1), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const tp = (c[i].h + c[i].l + c[i].c) / 3, v = c[i].v > 0 ? c[i].v : 1; P[i + 1] = P[i] + tp * v; V[i + 1] = V[i] + v; }
  for (let k = 0; k < n; k++) { let a = Math.max(0, k - 199); for (let i = a; i <= k; i++) if (c[i].h > c[a].h) a = i; out[k] = (P[k + 1] - P[a]) / (V[k + 1] - V[a]); }
  return out;
}
function dailyTrend(d1, len) {   // last CLOSED daily close above its len-day simple average?
  const sma = []; let s = 0; d1.forEach((x, i) => { s += x.c; if (i >= len) s -= d1[i - len].c; sma.push(i >= len - 1 ? s / len : null); });
  return (t) => { let lo = 0, hi = d1.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d1[m].t + 86400 <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 && sma[a] != null && d1[a].c > sma[a]; };
}
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const OLD = B.rays | B.volume | B.osc;
const fee = 0.0005, funding = 0.0001;
// variants: [name, entry filter, stopAtr, trail]
const V = [
  ["Old rule (2xATR stop, trail 10)", "", 2, 10],
  ["+ VWAP from high", "vwap", 2, 10],
  ["+ above 200-day", "d200", 2, 10],
  ["+ above 50-day", "d50", 2, 10],
  ["+ VWAP + above 200-day", "vwap+d200", 2, 10],
  ["+ above 20-day", "d20", 2, 10],
  ["+ above 100-day", "d100", 2, 10],
  ["stop 1.5xATR", "", 1.5, 10],
  ["stop 3xATR", "", 3, 10],
  ["trail 5", "", 2, 5],
  ["trail 20", "", 2, 20],
  ["stop 3xATR, trail 20", "", 3, 20],
  ["+ above 50-day, trail 20", "d50", 2, 20],
  ["+ above 50-day, stop 3xATR", "d50", 3, 10],
  ["+ above 50-day + VWAP", "d50+vwap", 2, 10],
  ["+ above 50-day + 200-day", "d50+d200", 2, 10],
];
function run(X, ctx, v, from = 0, to = Infinity) {
  const c = X.c, [, ef, sa, tr] = v;
  const allow = (k) => {
    if (ctx.gold && !ctx.d200(c[k].t + 14400)) return false;           // gold always needs the 200-day filter
    if (ef.includes("vwap") && !(c[k].c > ctx.vw[k])) return false;
    if (ef.includes("d200") && !ctx.d200(c[k].t + 14400)) return false;
    if (ef.includes("d50") && !ctx.d50(c[k].t + 14400)) return false;
    if (ef.includes("d20") && !ctx.d20(c[k].t + 14400)) return false;
    if (ef.includes("d100") && !ctx.d100(c[k].t + 14400)) return false;
    return true;
  };
  const r = F.replayFilters(X, { need: OLD, plus: B.structure, sides: "long", allow, stopAtr: sa, trail: tr });
  return r.trades.filter((t) => t.t >= from && t.t < to).map((t) => {
    const hours = (t.exitT - t.t) / 3600 + 4, risk = Math.abs(t.entry - t.stop0);
    return { ...t, r: t.r - (fee * (t.entry + t.exit) + funding * (hours / 8) * t.entry) / risk };
  });
}
const T = (y) => Date.UTC(y, 0, 1) / 1000, now = Date.now() / 1000;
const S = (tr) => F.summarize(tr, 1);
const f = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const table = {};
for (const [sym, gold] of [["BTCUSDT", false], ["ETHUSDT", false], ["ZECUSDT", false], ["PAXGUSDT", true]]) {
  const c4 = (await klines(sym, "4h", Date.UTC(2019, 0, 1))).filter((x) => x.t + 14400 <= now);
  const d1 = (await klines(sym, "1d", Date.UTC(2018, 0, 1))).filter((x) => x.t + 86400 <= now);
  const X = F.context({ "4h": c4, "1d": d1.filter((x) => x.t >= Date.UTC(2019, 0, 1) / 1000 - 86400 * 400) }, "4h");
  const ctx = { gold, vw: vwapHigh(c4), d200: dailyTrend(d1, 200), d50: dailyTrend(d1, 50), d20: dailyTrend(d1, 20), d100: dailyTrend(d1, 100) };
  for (const v of V) {
    const all = S(run(X, ctx, v)), a = S(run(X, ctx, v, 0, T(2024))), b = S(run(X, ctx, v, T(2024)));
    (table[v[0]] = table[v[0]] || {})[sym] = { all, a, b };
  }
}
// random-walk null for every variant (no daily trend on random data except via its own fake dailies)
function rw(n, seed) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2019);
  for (let i = 0; i < n; i++) { const o = p; p = p * Math.exp(0.018 * g()); const h = Math.max(o, p) * (1 + Math.abs(g()) * 0.006), l = Math.min(o, p) * (1 - Math.abs(g()) * 0.006); out.push({ t, o, h, l, c: p, v: 1000 * Math.exp(0.5 * g()) }); t += 14400; }
  return out;
}
const nul = {};
for (const v of V) {
  const xs = [];
  for (let k = 0; k < 16; k++) {
    const c4 = rw(6000, 7 + k * 101), d1 = [];
    for (let i = 0; i + 6 <= c4.length; i += 6) { const g = c4.slice(i, i + 6); d1.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[5].c, v: g.reduce((a, x) => a + x.v, 0) }); }
    const X = F.context({ "4h": c4, "1d": d1 }, "4h"), ctx = { gold: false, vw: vwapHigh(c4), d200: dailyTrend(d1, 200), d50: dailyTrend(d1, 50), d20: dailyTrend(d1, 20), d100: dailyTrend(d1, 100) };
    const s = S(run(X, ctx, v)); if (s.n) xs.push(s.avgR);
  }
  nul[v[0]] = xs.reduce((a, b) => a + b, 0) / xs.length;
}
console.log("\nRESULTS — avg R per trade after fees (all history | 2019-23 | 2024-now), trades, max drawdown; 'edge' = avg R minus the random-walk score");
for (const v of V) {
  console.log(`\n${v[0]}   (random-walk score ${f(nul[v[0]])}R)`);
  for (const sym of ["BTCUSDT", "ETHUSDT", "ZECUSDT", "PAXGUSDT"]) {
    const x = table[v[0]][sym];
    console.log(`  ${sym.padEnd(9)} ${f(x.all.avgR)}R | ${x.a.n ? f(x.a.avgR) : " n/a "} | ${x.b.n ? f(x.b.avgR) : " n/a "}   ${String(x.all.n).padStart(4)} trades  win ${(x.all.winRate * 100).toFixed(0)}%  total ${f(x.all.totalR)}R  DD ${x.all.dd.toFixed(1)}%  edge ${f(x.all.avgR - nul[v[0]])}R`);
  }
}
