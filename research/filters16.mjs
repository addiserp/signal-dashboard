// Research: all 16 filters, every combination of up to 4, on real Binance 4H candles (2019 → now), longs only.
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
const nm = (m) => F.KEYS.filter((k, b) => m & (1 << b)).map((k) => F.FILTERS[k].name).join(" + ") || "plain";
const f = (s) => s && s.n ? `${String(s.n).padStart(4)} tr  win ${(s.winRate * 100).toFixed(0).padStart(2)}%  ${(s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(3)}R  ret ${s.ret.toFixed(0)}%  DD ${s.dd.toFixed(0)}%` : "   0 tr";
const start = Date.UTC(2019, 0, 1);
for (const sym of (process.env.SYMS || "BTCUSDT,ETHUSDT,ZECUSDT,PAXGUSDT").split(",")) {
  const data = { "4h": await klines(sym, "4h", start - 60 * 86400e3), "1d": await klines(sym, "1d", start - 300 * 86400e3) };
  const t0 = Date.now();
  const S = F.study(data, { tf: "4h", sides: "long", startT: start / 1000, risk: 1, extra: [2 | 8 | 32] });
  console.log(`\n===== ${sym}  ${data["4h"].length} candles  study ${((Date.now() - t0) / 1000).toFixed(1)} s  (${S.tested} combos)`);
  console.log(`plain Donchian                 ${f(S.combos[0])}`);
  console.log(`addis-4H (TL+Vol+Osc) Donchian ${f(S.combos[42])}   filters-only ${f(S.only.trail[42])}`);
  console.log("-- one filter (Donchian + filter | filters only, trailing stop)");
  F.KEYS.forEach((k, b) => console.log(`${F.FILTERS[k].name.padEnd(20)} ${f(S.combos[1 << b])} | ${f(S.only.trail[1 << b])}`));
  for (const [lab, key] of [["Donchian + filters", "c"], ["filters only, trail", "trail"], ["filters only, filter exit", "filters"]]) {
    console.log(`-- top 5: ${lab}`);
    S.top[key].forEach(([m, s]) => console.log(`  ${f(s)}  ${nm(m)}`));
  }
}
