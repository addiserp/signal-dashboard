// Research: "Daily profile" setup (Capital Mind FX Short), made mechanical and backtested.
// Long (sell side mirrored):
//   1. levels = previous UTC day's high (PDH) and low (PDL); the draw = liquidity beyond them
//   2. raid: price trades below PDL; then displacement: a bullish candle with body >= K x ATR(14) closing back above PDL
//   3. no chase: entry is a limit at the retest of the displacement candle (its open, or the middle of its body)
//   4. stop just below the raid low, target 2R; trade only if the draw (PDH) lies beyond the 2R target ("range day, no draw = no trade")
//   Order expires after 16 candles; a new low below the stop before the fill cancels it; if neither stop nor target in 24h, exit at market.
//   One long and one short setup per day at most; costs 0.05% per side.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bases = ["https://data-api.binance.vision/api/v3/klines", "https://api.binance.com/api/v3/klines"];
async function klines(sym, interval, startMs) {
  const out = []; let end = Date.now();
  for (let guard = 0; guard < 400; guard++) {
    let page = null;
    for (const b of bases) { try { const r = await fetch(`${b}?symbol=${sym}&interval=${interval}&limit=1000&endTime=${end}`); if (r.ok) { page = await r.json(); break; } } catch {} }
    if (!page || !page.length) break;
    out.unshift(...page.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })));
    if (page[0][0] <= startMs || page.length < 1000) break;
    end = page[0][0] - 1;
  }
  const seen = new Set(); return out.filter((x) => !seen.has(x.t) && seen.add(x.t) && x.t * 1000 >= startMs);
}
function atr(c, n = 14) { const a = new Float64Array(c.length); let s = 0; for (let i = 1; i < c.length; i++) { const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)); s = i <= n ? s + tr : s - s / n + tr; a[i] = i < n ? s / i : s / n; } return a; }
function backtest(c, o) {
  const { K = 1.5, f = 0.5, drawFilter = true, R = 2, fee = 0.0005, sec = 900 } = o;
  const A = atr(c), day = (t) => Math.floor(t / 86400), trades = [];
  const perDay = Math.round(86400 / sec), expire = Math.round(4 * 3600 / sec), maxHold = perDay;
  // previous-day high/low per day
  const H = new Map(), L = new Map();
  for (const x of c) { const d = day(x.t); H.set(d, Math.max(H.get(d) ?? -Infinity, x.h)); L.set(d, Math.min(L.get(d) ?? Infinity, x.l)); }
  let i = 0;
  while (i < c.length) {
    const d = day(c[i].t); let j = i; while (j < c.length && day(c[j].t) === d) j++;
    const pdh = H.get(d - 1), pdl = L.get(d - 1);
    if (pdh != null && j - i > perDay * 0.8) {
      for (const dir of [1, -1]) {
        let raided = false, ext = dir > 0 ? Infinity : -Infinity, done = false;
        for (let k = i; k < j && !done; k++) {
          const x = c[k];
          if (dir > 0 ? x.l < pdl : x.h > pdh) raided = true;
          if (raided) ext = dir > 0 ? Math.min(ext, x.l) : Math.max(ext, x.h);
          if (!raided || (x.t % 86400) >= 20 * 3600) continue;              // setups only before 20:00 UTC
          const body = dir * (x.c - x.o);
          if (!(body >= K * A[k] && (dir > 0 ? x.c > pdl : x.c < pdh))) continue;
          done = true;                                                       // one setup per side per day
          const entry = x.o + (x.c - x.o) * f, stop = ext - dir * 0.1 * A[k], risk = dir * (entry - stop);
          if (!(risk > 0)) break;
          const target = entry + dir * R * risk;
          if (drawFilter && !(dir > 0 ? pdh >= target : pdl <= target)) break;
          // wait for the retest
          let fill = -1;
          for (let m = k + 1; m < Math.min(c.length, k + 1 + expire); m++) {
            if (dir > 0 ? c[m].l <= stop : c[m].h >= stop) break;
            if (dir > 0 ? c[m].l <= entry : c[m].h >= entry) { fill = m; break; }
          }
          if (fill < 0) break;
          const px = dir > 0 ? Math.min(entry, c[fill].o) : Math.max(entry, c[fill].o);
          let exit = null, how = "time";
          for (let m = fill; m < Math.min(c.length, fill + maxHold); m++) {
            const hitS = dir > 0 ? c[m].l <= stop : c[m].h >= stop, hitT = dir > 0 ? c[m].h >= target : c[m].l <= target;
            if (m === fill && hitT && !hitS && (dir > 0 ? c[m].c >= target : c[m].c <= target)) { exit = target; how = "target"; break; }
            if (hitS) { exit = stop; how = "stop"; break; }                // stop first when both in one candle (conservative)
            if (hitT) { exit = target; how = "target"; break; }
            exit = c[m].c;
          }
          if (exit == null) break;
          const rk = dir * (px - stop);
          trades.push({ t: c[fill].t, dir, r: dir * (exit - px) / rk - fee * (px + exit) / rk, how });
        }
      }
    }
    i = j;
  }
  return trades;
}
function summ(tr) {
  const n = tr.length; if (!n) return { n: 0 };
  let w = 0, s = 0, eq = 100, pk = 100, dd = 0;
  for (const t of tr.sort((a, b) => a.t - b.t)) { s += t.r; if (t.r > 0) w++; eq *= 1 + 0.01 * t.r; pk = Math.max(pk, eq); dd = Math.max(dd, (pk - eq) / pk * 100); }
  return { n, win: w / n, avg: s / n, tot: s, dd };
}
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.win * 100).toFixed(0).padStart(2)}%  avg ${(s.avg >= 0 ? "+" : "") + s.avg.toFixed(3)}R  total ${(s.tot >= 0 ? "+" : "") + s.tot.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
const VAR = [
  ["video rules (K1.5, mid-body retest, draw filter)", { K: 1.5, f: 0.5, drawFilter: true }],
  ["same, retest at the candle open", { K: 1.5, f: 0, drawFilter: true }],
  ["same, no draw filter", { K: 1.5, f: 0.5, drawFilter: false }],
  ["weaker displacement K1.0", { K: 1.0, f: 0.5, drawFilter: true }],
  ["stronger displacement K2.5", { K: 2.5, f: 0.5, drawFilter: true }],
  ["target 3R", { K: 1.5, f: 0.5, drawFilter: true, R: 3 }],
];
const T = (y) => Date.UTC(y, 0, 1) / 1000;
for (const iv of ["15m", "1h"]) {
  const sec = iv === "15m" ? 900 : 3600;
  for (const sym of ["BTCUSDT", "ETHUSDT", "PAXGUSDT"]) {
    const c = await klines(sym, iv, Date.UTC(2021, 0, 1));
    console.log(`\n=== ${sym} ${iv} · ${c.length} candles from ${new Date(c[0].t * 1000).toISOString().slice(0, 10)} ===`);
    for (const [name, o] of VAR) {
      const tr = backtest(c, { ...o, sec });
      const L = tr.filter((t) => t.dir > 0), S = tr.filter((t) => t.dir < 0);
      console.log(`  ${name.padEnd(50)} ${fmt(summ([...tr]))}`);
      console.log(`     longs ${fmt(summ([...L])).trim()} | shorts ${fmt(summ([...S])).trim()} | 2021-23 avg ${(summ(tr.filter((t) => t.t < T(2024))).avg ?? 0).toFixed(3)}R · 2024-now avg ${(summ(tr.filter((t) => t.t >= T(2024))).avg ?? 0).toFixed(3)}R`);
    }
  }
}
// null test: random walk with similar 15m volatility
function rw(n, seed, sec) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2021); const vol = 0.0035 * Math.sqrt(sec / 900);
  for (let i = 0; i < n; i++) { const o = p; p = p * Math.exp(vol * g()); out.push({ t, o, h: Math.max(o, p) * (1 + Math.abs(g()) * vol / 3), l: Math.min(o, p) * (1 - Math.abs(g()) * vol / 3), c: p, v: 1 }); t += sec; }
  return out;
}
console.log("\n=== Random-walk null test (15m, 10 runs × 100,000 candles) ===");
for (const [name, o] of VAR) {
  const all = []; for (let k = 0; k < 10; k++) all.push(...backtest(rw(100000, 11 + 97 * k, 900), { ...o, sec: 900 }));
  console.log(`  ${name.padEnd(50)} ${fmt(summ(all))}`);
}
