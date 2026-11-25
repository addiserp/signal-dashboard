// Research: does a VWAP check improve addis-4H Signals (Trend lines + Volume)?
// VWAP versions (all use only candles up to the signal candle):
//   high  = VWAP anchored at the highest high of the last 200 candles (the teal line on the chart)
//   week  = VWAP since Monday 00:00 UTC
//   roll  = rolling 30-candle (5-day) VWAP
// The check: the signal candle closes above that VWAP. Long only, 2xATR stop trailed to the 10-candle low, fees 0.05%/side + funding.
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
function vwaps(c) {
  const n = c.length, P = new Float64Array(n + 1), V = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const tp = (c[i].h + c[i].l + c[i].c) / 3, v = c[i].v > 0 ? c[i].v : 1; P[i + 1] = P[i] + tp * v; V[i + 1] = V[i] + v; }
  const avg = (a, b) => (P[b + 1] - P[a]) / (V[b + 1] - V[a]);
  const high = new Float64Array(n), week = new Float64Array(n), roll = new Float64Array(n);
  let wStart = 0;
  for (let k = 0; k < n; k++) {
    let a = Math.max(0, k - 199); for (let i = a; i <= k; i++) if (c[i].h > c[a].h) a = i;
    high[k] = avg(a, k);
    const d = new Date(c[k].t * 1000); if (d.getUTCDay() === 1 && d.getUTCHours() === 0) wStart = k;
    week[k] = avg(wStart, k);
    roll[k] = avg(Math.max(0, k - 29), k);
  }
  return { high, week, roll };
}
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const BASE = B.rays | B.volume, OLD = B.rays | B.volume | B.osc;
const fee = 0.0005, funding = 0.0001;
function run(X, vw, need, which, from = 0, to = Infinity, allowExtra = null) {
  const c = X.c;
  const allow = (k) => (!which || c[k].c > vw[which][k]) && (!allowExtra || allowExtra(k));
  const r = F.replayFilters(X, { need, plus: B.structure, sides: "long", allow });
  return r.trades.filter((t) => t.t >= from && t.t < to).map((t) => {
    const hours = (t.exitT - t.t) / 3600 + 4, risk = Math.abs(t.entry - t.stop0);
    return { ...t, r: t.r - (fee * (t.entry + t.exit) + funding * (hours / 8) * t.entry) / risk };
  });
}
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.winRate * 100).toFixed(0).padStart(2)}%  avg ${(s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(3)}R  total ${(s.totalR >= 0 ? "+" : "") + s.totalR.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
const VARIANTS = [["TL+Vol (now)", BASE, null], ["TL+Vol + VWAP from high", BASE, "high"], ["TL+Vol + weekly VWAP", BASE, "week"], ["TL+Vol + 5-day VWAP", BASE, "roll"], ["TL+Vol+Osc (old rule)", OLD, null], ["TL+Vol+Osc + VWAP from high", OLD, "high"]];
const T = (y) => Date.UTC(y, 0, 1) / 1000, now = Date.now() / 1000;
function aboveFn(d1) {
  const sma = []; let s = 0; d1.forEach((x, i) => { s += x.c; if (i >= 200) s -= d1[i - 200].c; sma.push(i >= 199 ? s / 200 : null); });
  return (t) => { let lo = 0, hi = d1.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d1[m].t + 86400 <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 && sma[a] != null && d1[a].c > sma[a]; };
}
const summary = [];
for (const [sym, t200] of [["BTCUSDT", false], ["ETHUSDT", false], ["ZECUSDT", false], ["PAXGUSDT", true]]) {
  const c4 = (await klines(sym, "4h", Date.UTC(2019, 0, 1))).filter((x) => x.t + 14400 <= now);
  const d1 = (await klines(sym, "1d", Date.UTC(2019, 0, 1))).filter((x) => x.t + 86400 <= now);
  const X = F.context({ "4h": c4, "1d": d1 }, "4h"), vw = vwaps(c4), above = aboveFn(d1);
  const extra = t200 ? (k) => above(c4[k].t + 14400) : null;
  console.log(`\n=== ${sym} · 4H long only${t200 ? " · only above the 200-day average" : ""} · ${c4.length} candles ===`);
  for (const [name, need, w] of VARIANTS) {
    for (const [lab, a, b] of [["all", 0, Infinity], ["2019-23", 0, T(2024)], ["2024-now", T(2024), Infinity]]) {
      const tr = run(X, vw, need, w, a, b, extra), s = F.summarize(tr, 1);
      console.log(`  ${name.padEnd(30)} ${lab.padEnd(8)} ${fmt(s)}`);
      if (lab === "all") { summary.push({ sym, name, s }); console.log(`  ${(name + " · A+ only").padEnd(30)} all      ${fmt(F.summarize(tr.filter((t) => t.aplus), 1))}`); }
    }
  }
}
function rw(n, seed) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2019);
  for (let i = 0; i < n; i++) { const o = p; p = p * Math.exp(0.018 * g()); const h = Math.max(o, p) * (1 + Math.abs(g()) * 0.006), l = Math.min(o, p) * (1 - Math.abs(g()) * 0.006); out.push({ t, o, h, l, c: p, v: 1000 * Math.exp(0.5 * g()) }); t += 14400; }
  return out;
}
console.log("\n=== Random-walk null test (20 runs × 6,000 candles) ===");
for (const [name, need, w] of VARIANTS) {
  const avg = []; let n = 0;
  for (let k = 0; k < 20; k++) {
    const c4 = rw(6000, 7 + k * 101), d1 = [];
    for (let i = 0; i + 6 <= c4.length; i += 6) { const g = c4.slice(i, i + 6); d1.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[5].c, v: g.reduce((a, x) => a + x.v, 0) }); }
    const X = F.context({ "4h": c4, "1d": d1 }, "4h"), s = F.summarize(run(X, vwaps(c4), need, w), 1);
    if (s.n) { avg.push(s.avgR); n += s.n; }
  }
  const mu = avg.reduce((a, b) => a + b, 0) / avg.length;
  console.log(`  ${name.padEnd(30)} avg ${mu >= 0 ? "+" : ""}${mu.toFixed(3)}R per trade, ${Math.round(n / 20)} trades per run`);
}
console.log("\nSUMMARY (all history):"); for (const x of summary) console.log(`  ${x.sym.padEnd(9)} ${x.name.padEnd(30)} ${fmt(x.s)}`);
