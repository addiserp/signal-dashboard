// Research: does addis-4H Signals still have an edge without the Oscillators check?
// Compares TL+Vol+Osc (current) with TL+Vol on 4H, long only, trailing stop, fees + funding; plus random-walk null tests.
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
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const RULES = { "TL+Vol+Osc (current)": B.rays | B.volume | B.osc, "TL+Vol (no oscillators)": B.rays | B.volume, "TL+Osc (no volume)": B.rays | B.osc };
const T = (y) => Date.UTC(y, 0, 1) / 1000;
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.winRate * 100).toFixed(0).padStart(2)}%  avg ${(s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(3)}R  total ${(s.totalR >= 0 ? "+" : "") + s.totalR.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
function aboveFn(d1) {
  const sma = []; let s = 0;
  d1.forEach((x, i) => { s += x.c; if (i >= 200) s -= d1[i - 200].c; sma.push(i >= 199 ? s / 200 : null); });
  return (t) => { let lo = 0, hi = d1.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d1[m].t + 86400 <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 && sma[a] != null && d1[a].c > sma[a]; };
}
const now = Date.now() / 1000;
const summary = [];
for (const [sym, trend200] of [["BTCUSDT", false], ["ETHUSDT", false], ["ZECUSDT", false], ["PAXGUSDT", true]]) {
  const c4 = (await klines(sym, "4h", Date.UTC(2019, 0, 1))).filter((x) => x.t + 14400 <= now);
  const d1 = (await klines(sym, "1d", Date.UTC(2019, 0, 1))).filter((x) => x.t + 86400 <= now);
  if (c4.length < 500) { console.log(`${sym}: not enough data`); continue; }
  const X = F.context({ "4h": c4, "1d": d1 }, "4h"), above = aboveFn(d1);
  const o = { sides: "long", feePct: 0.05, fundingPct: 0.01, startT: c4[0].t };
  console.log(`\n=== ${sym} · 4H long only · trailing stop · ${c4.length} candles from ${new Date(c4[0].t * 1000).toISOString().slice(0, 10)}${trend200 ? " · only above the 200-day average" : ""} ===`);
  for (const [name, m] of Object.entries(RULES)) {
    let tr = F.runFiltersOnly(X, o, m, "trail");
    if (trend200) tr = tr.filter((t) => above(t.t));
    const ap = tr.filter((t) => F.checks(X, c4.findIndex((x) => x.t >= t.t) - 1, 1).structure);
    for (const [lab, a, b] of [["all", 0, Infinity], ["2019-23", 0, T(2024)], ["2024-now", T(2024), Infinity]]) {
      const s = F.summarize(tr.filter((t) => t.t >= a && t.t < b), 1);
      console.log(`  ${name.padEnd(26)} ${lab.padEnd(8)} ${fmt(s)}`);
      if (lab === "all") summary.push({ sym, name, s });
    }
    console.log(`  ${(name + " · A+ only").padEnd(26)} all      ${fmt(F.summarize(ap, 1))}`);
  }
}
// ---- null test: random-walk prices with BTC-like volatility; an edge must beat this ----
function rw(n, seed) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2019);
  for (let i = 0; i < n; i++) { const o = p; p = p * Math.exp(0.018 * g()); const h = Math.max(o, p) * (1 + Math.abs(g()) * 0.006), l = Math.min(o, p) * (1 - Math.abs(g()) * 0.006); out.push({ t, o, h, l, c: p, v: 1000 * Math.exp(0.5 * g()) }); t += 14400; }
  return out;
}
console.log("\n=== Random-walk null test (20 runs × 6,000 candles; an edge should clearly beat this) ===");
for (const [name, m] of Object.entries(RULES)) {
  const avg = []; let n = 0;
  for (let k = 0; k < 20; k++) {
    const c4 = rw(6000, 7 + k * 101); const d1 = [];
    for (let i = 0; i + 6 <= c4.length; i += 6) { const g = c4.slice(i, i + 6); d1.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[5].c, v: g.reduce((a, x) => a + x.v, 0) }); }
    const X = F.context({ "4h": c4, "1d": d1 }, "4h"); const s = F.summarize(F.runFiltersOnly(X, { sides: "long", feePct: 0.05, fundingPct: 0.01, startT: c4[0].t }, m, "trail"), 1);
    if (s.n) { avg.push(s.avgR); n += s.n; }
  }
  const mu = avg.reduce((a, b) => a + b, 0) / avg.length, sd = Math.sqrt(avg.reduce((a, b) => a + (b - mu) ** 2, 0) / avg.length);
  console.log(`  ${name.padEnd(26)} avg ${mu >= 0 ? "+" : ""}${mu.toFixed(3)}R per trade (spread ±${sd.toFixed(3)}), ${Math.round(n / 20)} trades per run`);
}
console.log("\nSUMMARY (all history):"); for (const x of summary) console.log(`  ${x.sym.padEnd(9)} ${x.name.padEnd(26)} ${fmt(x.s)}`);
