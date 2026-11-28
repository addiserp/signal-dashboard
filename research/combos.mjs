// The user's 7 BTC combinations (Donchian + filters, 4H, long + short, fees 0.05% + funding) split by year,
// plus the same switches on ETH and SOL as an out-of-sample check.
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
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const TVO = B.rays | B.volume | B.osc;
const COMBOS = [
  ["Plain Donchian", 0],
  ["TL+Vol+Osc (base)", TVO],
  ["1 Vol+Osc+50d+EMA+ST+BB", B.volume | B.osc | B.above50 | B.ema | B.supertrend | B.bb],
  ["2 TL+Vol+Osc+50d", TVO | B.above50],
  ["3 TL+Vol+Osc+EMA", TVO | B.ema],
  ["4 TL+Vol+Osc+RSI", TVO | B.rsi],
  ["5 TL+Vol+Osc+MACD", TVO | B.macd],
  ["6 TL+Vol+Osc+VWAP", TVO | B.vwap],
  ["7 TL+Vol+Osc+Ichimoku", TVO | B.ichimoku],
];
const T = (y) => Date.UTC(y, 0, 1) / 1000;
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
  const c4 = await klines(sym, "4h", Date.UTC(2017, 8, 1)), d1 = await klines(sym, "1d", Date.UTC(2017, 0, 1));
  const X = F.context({ "4h": c4, "1d": d1 }, "4h");
  const opts = { sides: "both", feePct: 0.05, fundingPct: 0.01, startT: T(2018) };
  console.log(`\n===== ${sym} 4H long+short · avg R per trade (trades) by year of entry · whole period at 4% risk =====`);
  console.log("combination".padEnd(26) + YEARS.map((y) => String(y).padStart(12)).join("") + "   | ALL: trades  avgR  ret%   maxDD  | years >0");
  for (const [name, need] of COMBOS) {
    const tr = F.runDonchian(X, opts, need);
    const cells = YEARS.map((y) => { const z = F.summarize(tr.filter((t) => t.t >= T(y) && t.t < T(y + 1)), 4); return z.n ? `${f2(z.avgR)}(${z.n})`.padStart(12) : "—".padStart(12); });
    const s = F.summarize(tr, 4);
    const pos = YEARS.filter((y) => { const z = F.summarize(tr.filter((t) => t.t >= T(y) && t.t < T(y + 1)), 4); return z.n && z.avgR > 0; }).length;
    // halves: 2018-21 vs 2022-now
    const h1 = F.summarize(tr.filter((t) => t.t < T(2022)), 4), h2 = F.summarize(tr.filter((t) => t.t >= T(2022)), 4);
    console.log(name.padEnd(26) + cells.join("") + `   | ${String(s.n).padStart(4)} ${f2(s.avgR)} ${s.ret.toFixed(0).padStart(7)}% ${s.dd.toFixed(0).padStart(4)}% | ${pos}/9   2018-21 ${f2(h1.avgR)} · 2022-now ${f2(h2.avgR)}`);
  }
}
