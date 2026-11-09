// Research: gold (PAXG as long history, XAUUSDT futures when reachable) with the six filters.
// Run from GitHub Actions: Actions → Research backtest → Run workflow.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./dfilters.js");
const SYM = process.env.SYM || "PAXGUSDT";
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
const now = Date.now() / 1000;
const c4 = (await klines(SYM, "4h", Date.UTC(2019, 0, 1))).filter((x) => x.t + 14400 <= now);
const d1 = (await klines(SYM, "1d", Date.UTC(2019, 0, 1))).filter((x) => x.t + 86400 <= now);
console.log(`${SYM}: ${c4.length} closed 4H candles ${new Date(c4[0].t * 1000).toISOString().slice(0, 10)} → ${new Date(c4.at(-1).t * 1000).toISOString().slice(0, 16)}Z, ${d1.length} daily`);
const B = Object.fromEntries(F.KEYS.map((k, b) => [k, 1 << b]));
const combos = {
  "Trend lines only": B.rays, "Structure only": B.structure, "Volume only": B.volume, "Oscillators only": B.osc,
  "TL + Vol + Osc (BTC rule)": B.rays | B.volume | B.osc,
  "Structure + Vol + Osc (proposed gold rule)": B.structure | B.volume | B.osc,
  "Structure + Osc": B.structure | B.osc,
  "Structure + Vol": B.structure | B.volume,
  "Structure + TL + Vol + Osc": B.structure | B.rays | B.volume | B.osc,
};
const fmt = (s) => s.n ? `${String(s.n).padStart(4)} trades  win ${(s.winRate * 100).toFixed(0).padStart(2)}%  avg ${(s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(2)}R  total ${(s.totalR >= 0 ? "+" : "") + s.totalR.toFixed(1)}R  maxDD ${s.dd.toFixed(1)}%` : "   0 trades";
function run(label, from, to) {
  const cc = c4.filter((x) => x.t < to), dd = d1.filter((x) => x.t < to);
  const X = F.context({ "4h": cc, "1d": dd }, "4h");
  const o = { sides: "long", feePct: 0.05, fundingPct: 0.01, startT: from };
  console.log(`\n=== ${SYM} long only · ${label} · fees 0.05%/side + funding · risk 1% ===`);
  console.log(`  ${"Plain Donchian".padEnd(44)} ${fmt(F.summarize(F.runDonchian(X, o, 0), 1))}`);
  for (const ex of ["trail", "filters"]) {
    console.log(`  -- filters only, exit: ${ex === "trail" ? "trailing stop (10-candle low)" : "when filters stop agreeing"}`);
    for (const [name, m] of Object.entries(combos)) console.log(`  ${name.padEnd(44)} ${fmt(F.summarize(F.runFiltersOnly(X, o, m, ex), 1))}`);
  }
  console.log(`  -- Donchian + filters`);
  for (const [name, m] of Object.entries(combos)) console.log(`  ${("DC + " + name).padEnd(44)} ${fmt(F.summarize(F.runDonchian(X, o, m), 1))}`);
}
const T = (y, m = 0, d = 1) => Date.UTC(y, m, d) / 1000;
run("all history", c4[0].t, Infinity);
run("2020-2023 (first half)", c4[0].t, T(2024));
run("2024-now (second half)", T(2024), Infinity);
// the last ~11 hours and the days before: what each 4H candle showed
const X = F.context({ "4h": c4, "1d": d1 }, "4h");
console.log(`\n=== ${SYM}: filter checks on the last 12 closed 4H candles (times UTC; EAT = +3) ===`);
for (let k = c4.length - 12; k < c4.length; k++) {
  const ck = F.checks(X, k, 1), x = c4[k];
  const t = (b) => b ? "✅" : "❌";
  console.log(`  ${new Date(x.t * 1000).toISOString().slice(5, 16).replace("T", " ")}  close ${x.c.toFixed(2).padStart(8)}  Structure ${t(ck.structure)} TrendLines ${t(ck.rays)} Volume ${t(ck.volume)} Osc ${t(ck.osc)} (${F.oscLabel(ck.oscRating)} ${ck.oscRating.toFixed(2)})  Liquidity ${t(ck.liquidity)} Fib ${t(ck.fib)}`);
}
const R = F.replayFilters(X, { need: B.structure | B.volume | B.osc, plus: B.rays, sides: "long" });
console.log(`\nProposed gold rule now: ${R.pending ? "SIGNAL on the last candle" : R.position ? `in a long since ${new Date(R.position.entryT * 1000).toISOString().slice(0, 16)}Z entry ${R.position.entry.toFixed(2)} stop ${R.position.stop.toFixed(2)} (${R.position.openR.toFixed(2)}R)` : "no trade"}`);
console.log("Last 5 trades of the proposed rule:");
for (const t of R.trades.slice(-5)) console.log(`  ${new Date(t.t * 1000).toISOString().slice(0, 16)}Z → ${new Date(t.exitT * 1000).toISOString().slice(0, 16)}Z  entry ${t.entry.toFixed(2)} exit ${t.exit.toFixed(2)}  ${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R${t.aplus ? " (A+)" : ""}`);
