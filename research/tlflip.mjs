// Research: "trend line break → reverse" (beginner Short, 4H): always in the market.
// Long when price breaks the down trend line, short when it breaks the up trend line; flip on every new break, no stop.
// Uses the same trend-line check as addis-4H Signals (rays: down ray broken, up ray holding — and the mirror for shorts).
// Results in R where 1R = 2xATR at entry (the risk unit our system uses), after 0.05%/side fees and 0.01%/8h funding.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./dfilters.js");
const bases = ["https://data-api.binance.vision/api/v3/klines", "https://api.binance.com/api/v3/klines"];
async function klines(sym, interval, startMs) {
  const out = []; let end = Date.now();
  for (let guard = 0; guard < 300; guard++) {
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
const fee = 0.0005, funding = 0.0001;
function flip(X, longOnly) {
  const { c, sec } = X, M = F.masks(X, "both"), tr = [];
  const up = (k) => (M.L[k] & B.rays) && !(M.L[k - 1] & B.rays), dn = (k) => (M.S[k] & B.rays) && !(M.S[k - 1] & B.rays);
  let pos = null;
  const close = (k, px) => {
    const hours = (c[k].t - c[pos.k].t) / 3600, cost = fee * (pos.entry + px) + funding * (hours / 8) * pos.entry;
    tr.push({ t: c[pos.k].t, dir: pos.dir, r: (pos.dir * (px - pos.entry) - cost) / pos.R }); pos = null;
  };
  for (let k = 211; k < c.length - 1; k++) {
    const sig = up(k) ? 1 : dn(k) ? -1 : 0;
    if (!sig) continue;
    if (pos && pos.dir === sig) continue;
    if (pos) close(k + 1, c[k + 1].o);
    if (sig > 0 || !longOnly) pos = { dir: sig, k: k + 1, entry: c[k + 1].o, R: 2 * X.atr[k] };
  }
  if (pos) close(c.length - 1, c[c.length - 1].c);
  return tr;
}
function summ(tr) {
  const n = tr.length; if (!n) return { n: 0 };
  let w = 0, s = 0, eq = 100, pk = 100, dd = 0;
  for (const t of tr) { s += t.r; if (t.r > 0) w++; eq *= 1 + 0.01 * t.r; pk = Math.max(pk, eq); dd = Math.max(dd, (pk - eq) / pk * 100); }
  return { n, win: w / n, avg: s / n, tot: s, dd };
}
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.win * 100).toFixed(0).padStart(2)}%  avg ${(s.avg >= 0 ? "+" : "") + s.avg.toFixed(3)}R  total ${(s.tot >= 0 ? "+" : "") + s.tot.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
const T = (y) => Date.UTC(y, 0, 1) / 1000, now = Date.now() / 1000;
const per = (tr) => `2019-23 ${(summ(tr.filter((t) => t.t < T(2024))).avg ?? 0).toFixed(3)}R · 2024-now ${(summ(tr.filter((t) => t.t >= T(2024))).avg ?? 0).toFixed(3)}R`;
for (const [iv, sec] of [["4h", 14400], ["1d", 86400], ["1h", 3600]]) {
  for (const sym of ["BTCUSDT", "ETHUSDT", "ZECUSDT", "PAXGUSDT"]) {
    const start = iv === "1h" ? Date.UTC(2021, 0, 1) : Date.UTC(2019, 0, 1);
    const c = (await klines(sym, iv, start)).filter((x) => x.t + sec <= now);
    const d1 = iv === "1d" ? c : (await klines(sym, "1d", start)).filter((x) => x.t + 86400 <= now);
    const X = F.context({ [iv]: c, "1d": d1 }, iv);
    console.log(`\n=== ${sym} ${iv} · ${c.length} candles ===`);
    const a = flip(X, false), b = flip(X, true);
    console.log(`  Video: flip long/short on every break  ${fmt(summ(a))}   (${per(a)})`);
    console.log(`     its longs ${fmt(summ(a.filter((t) => t.dir > 0))).trim()} | its shorts ${fmt(summ(a.filter((t) => t.dir < 0))).trim()}`);
    console.log(`  Long only, exit at the opposite break  ${fmt(summ(b))}   (${per(b)})`);
    if (iv === "4h") {
      const o = { sides: "long", feePct: 0.05, fundingPct: 0.01, startT: c[0].t };
      const tl = F.runFiltersOnly(X, o, B.rays, "trail"), old = F.runFiltersOnly(X, o, B.rays | B.volume | B.osc, "trail");
      console.log(`  Trend lines only + our trailing stop   ${fmt(summ(tl.map((t) => ({ ...t }))))}   (${per(tl)})`);
      console.log(`  Old addis-4H rule (TL+Vol+Osc)         ${fmt(summ(old.map((t) => ({ ...t }))))}   (${per(old)})`);
    }
  }
}
function rw(n, seed) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = []; let p = 30000, t = T(2019);
  for (let i = 0; i < n; i++) { const o = p; p = p * Math.exp(0.018 * g()); out.push({ t, o, h: Math.max(o, p) * (1 + Math.abs(g()) * 0.006), l: Math.min(o, p) * (1 - Math.abs(g()) * 0.006), c: p, v: 1000 * Math.exp(0.5 * g()) }); t += 14400; }
  return out;
}
console.log("\n=== Random-walk null test (4H, 12 runs × 6,000 candles) ===");
const all = [], lo = [];
for (let k = 0; k < 12; k++) {
  const c4 = rw(6000, 7 + k * 101), d1 = [];
  for (let i = 0; i + 6 <= c4.length; i += 6) { const g = c4.slice(i, i + 6); d1.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[5].c, v: g.reduce((a, x) => a + x.v, 0) }); }
  const X = F.context({ "4h": c4, "1d": d1 }, "4h"); all.push(...flip(X, false)); lo.push(...flip(X, true));
}
console.log(`  Video flip ${fmt(summ(all))}\n  Long only  ${fmt(summ(lo))}`);
