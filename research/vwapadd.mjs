// Research: does adding "VWAP from high" to the live addis-4H rule help?
// Live rule: Trend lines + Volume + Oscillators on a closed 4H candle, buys above the 50-day average, sells below (crypto).
// Variant: the same plus VWAP from high (close above the VWAP anchored at the 200-candle high; below the VWAP from the low for sells).
// BUY : Trend lines + Volume + Oscillators agree on a closed 4H candle AND the last closed daily close is ABOVE its 50-day average
// SELL: the mirror — down-trend-line checks + Volume + Oscillators (Sell) AND daily close BELOW its 50-day average
// Stop 2xATR, trailed to the 10-candle low (high for sells); fees 0.05%/side + 0.01%/8h funding charged on both sides.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./dfilters16.js");
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
function trendSide(d1, len) {   // +1 if the last CLOSED daily close is above its len-day average, -1 below, 0 unknown
  const sma = []; let s = 0; d1.forEach((x, i) => { s += x.c; if (i >= len) s -= d1[i - len].c; sma.push(i >= len - 1 ? s / len : null); });
  return (t) => { let lo = 0, hi = d1.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d1[m].t + 86400 <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a < 0 || sma[a] == null ? 0 : d1[a].c > sma[a] ? 1 : -1; };
}
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const NEED = B.rays | B.volume | B.osc, fee = 0.0005, funding = 0.0001;
function run(X, allow, need = NEED) {
  const r = F.replayFilters(X, { need, plus: B.structure, sides: "both", allow });
  return r.trades.map((t) => { const hours = (t.exitT - t.t) / 3600 + 4, risk = Math.abs(t.entry - t.stop0); return { ...t, r: t.r - (fee * (t.entry + t.exit) + funding * (hours / 8) * t.entry) / risk }; });
}
function summ(tr) {
  const n = tr.length; if (!n) return { n: 0 };
  let w = 0, s = 0, eq = 100, pk = 100, dd = 0;
  for (const t of [...tr].sort((a, b) => a.exitT - b.exitT)) { s += t.r; if (t.r > 0) w++; eq *= 1 + 0.01 * t.r; pk = Math.max(pk, eq); dd = Math.max(dd, (pk - eq) / pk * 100); }
  return { n, win: w / n, avg: s / n, tot: s, dd };
}
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.win * 100).toFixed(0).padStart(2)}%  avg ${(s.avg >= 0 ? "+" : "") + s.avg.toFixed(3)}R  total ${(s.tot >= 0 ? "+" : "") + s.tot.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
const T = (y) => Date.UTC(y, 0, 1) / 1000, now = Date.now() / 1000;
const per = (tr) => ["2019-21", "2022-23", "2024-now"].map((lab, i) => { const a = [0, T(2022), T(2024)][i], b = [T(2022), T(2024), Infinity][i]; const s = summ(tr.filter((t) => t.t >= a && t.t < b)); return `${lab} ${s.n ? (s.avg >= 0 ? "+" : "") + s.avg.toFixed(2) + "R/" + s.n : "—"}`; }).join(" · ");
const VW = NEED | B.vwap;
const VARS = [["live rule (TL+Vol+Osc + 50-day)", NEED], ["live rule + VWAP from high", VW]];
const tot = { [NEED]: { L: [], S: [] }, [VW]: { L: [], S: [] } };
for (const sym of process.env.NULLONLY ? [] : (process.env.SYMS || "BTCUSDT,ETHUSDT,ZECUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,PAXGUSDT").split(",")) {
  const c4 = (await klines(sym, "4h", Date.UTC(2019, 0, 1))).filter((x) => x.t + 14400 <= now);
  const d1 = (await klines(sym, "1d", Date.UTC(2018, 0, 1))).filter((x) => x.t + 86400 <= now);
  if (c4.length < 500) { console.log(sym, "not enough data"); continue; }
  const X = F.context({ "4h": c4, "1d": d1.filter((x) => x.t >= T(2019) - 86400 * 400) }, "4h");
  const s50 = trendSide(d1, 50);
  const live = ["BTCUSDT", "ETHUSDT", "ZECUSDT"].includes(sym);
  console.log(`\n=== ${sym} · 4H · ${c4.length} candles ${live ? "(live alert coin)" : "(not used to build the rule)"} ===`);
  for (const [name, need] of VARS) {
    const tr = run(X, (k, dir) => s50(c4[k].t + 14400) === dir, need);
    const L = tr.filter((t) => t.dir > 0), S = tr.filter((t) => t.dir < 0);
    if (sym !== "PAXGUSDT") { tot[need].L.push(...L); tot[need].S.push(...S); }
    console.log(`  ${name}`);
    console.log(`    BUYS   ${fmt(summ(L))}   (${per(L)})`);
    console.log(`    SELLS  ${fmt(summ(S))}   (${per(S)})`);
    console.log(`    BUYS A+ ${fmt(summ(L.filter((t) => t.aplus)))}`);
  }
}
console.log("\n=== All crypto together (gold left out) ===");
for (const [name, need] of VARS) console.log(`  ${name}\n    BUYS  ${fmt(summ(tot[need].L))}   (${per(tot[need].L)})\n    SELLS ${fmt(summ(tot[need].S))}   (${per(tot[need].S)})`);
function rw(n, seed, sub = 48) {   // candles from a fine price path (real highs/lows), good random generator
  let a = seed >>> 0; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2019); const sd = 0.018 / Math.sqrt(sub);
  for (let i = 0; i < n; i++) { const o = p; let h = p, l = p; for (let j = 0; j < sub; j++) { p *= Math.exp(sd * g()); h = Math.max(h, p); l = Math.min(l, p); } out.push({ t, o, h, l, c: p, v: 1000 * Math.exp(0.5 * g()) }); t += 14400; }
  return out;
}
console.log("\n=== Random-walk null test (16 runs × 6,000 4H candles, no real trends) ===");
const nul = { [NEED]: [], [VW]: [] };
for (let k = 0; k < 32; k++) {
  const c4 = rw(6000, 7 + k * 101), d1 = [];
  for (let i = 0; i + 6 <= c4.length; i += 6) { const g = c4.slice(i, i + 6); d1.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[5].c, v: g.reduce((a, x) => a + x.v, 0) }); }
  const X = F.context({ "4h": c4, "1d": d1 }, "4h"), s50 = trendSide(d1, 50);
  for (const [, need] of VARS) nul[need].push(...run(X, (k, dir) => s50(c4[k].t + 14400) === dir, need));
}
for (const [name, need] of VARS) console.log(`  ${name}: ${fmt(summ(nul[need]))}`);
