// Market structure engine (Smart Money Concepts)
//  - swing highs / lows from pivots (left/right strength per timeframe)
//  - BOS   = a candle CLOSES beyond the last swing in the direction of the trend (continuation)
//  - CHoCH = the first close beyond a swing against the trend (change of character)
(function (root) {
  "use strict";
  const PIV = { "1M": 2, "1w": 2, "1d": 3, "4h": 4, "1h": 5, "15m": 5 };

  function analyzeTf(c, tf) {
    const p = PIV[tf] || 3;
    const n = c.length;
    const swings = [];          // {i, type:'H'|'L', price, label:'HH'|'LH'|'HL'|'LL'}
    const events = [];          // {kind:'BOS'|'CHoCH', dir:1|-1, level, from, at}
    let lastH = null, lastL = null;   // latest confirmed swing high / low (may be broken)
    let prevH = null, prevL = null;
    let trend = 0;

    for (let k = 0; k < n; k++) {
      // a pivot at i = k - p is confirmed once p candles have closed after it
      const i = k - p;
      if (i >= p) {
        let hi = true, lo = true;
        for (let j = i - p; j <= i + p; j++) {
          if (j === i) continue;
          if (c[j].h >= c[i].h) hi = false;
          if (c[j].l <= c[i].l) lo = false;
        }
        if (hi) {
          const label = prevH ? (c[i].h > prevH.price ? "HH" : "LH") : "H";
          lastH = { i, price: c[i].h, broken: false };
          prevH = lastH;
          swings.push({ i, t: c[i].t, type: "H", price: c[i].h, label });
        }
        if (lo) {
          const label = prevL ? (c[i].l > prevL.price ? "HL" : "LL") : "L";
          lastL = { i, price: c[i].l, broken: false };
          prevL = lastL;
          swings.push({ i, t: c[i].t, type: "L", price: c[i].l, label });
        }
      }
      // breaks are confirmed by the candle close (the forming candle counts as "pending")
      const closed = k < n - 1;
      if (lastH && !lastH.broken && c[k].c > lastH.price && k > lastH.i) {
        if (closed) {
          events.push({ kind: trend === -1 ? "CHoCH" : "BOS", dir: 1, level: lastH.price, from: lastH.i, at: k, tFrom: c[lastH.i].t, tAt: c[k].t });
          lastH.broken = true; trend = 1;
        }
      }
      if (lastL && !lastL.broken && c[k].c < lastL.price && k > lastL.i) {
        if (closed) {
          events.push({ kind: trend === 1 ? "CHoCH" : "BOS", dir: -1, level: lastL.price, from: lastL.i, at: k, tFrom: c[lastL.i].t, tAt: c[k].t });
          lastL.broken = true; trend = -1;
        }
      }
    }

    const last = c[n - 1];
    const ev = events[events.length - 1] || null;
    // the levels that would print the next break
    const nextUp = lastH && !lastH.broken ? lastH.price : null;   // close above = bullish break
    const nextDn = lastL && !lastL.broken ? lastL.price : null;   // close below = bearish break
    let pending = null;   // forming candle already beyond a level (not closed yet)
    if (nextUp != null && last.c > nextUp) pending = { dir: 1, kind: trend === -1 ? "CHoCH" : "BOS", level: nextUp };
    if (nextDn != null && last.c < nextDn) pending = { dir: -1, kind: trend === 1 ? "CHoCH" : "BOS", level: nextDn };

    return {
      trend, swings, events, last: ev, nextUp, nextDn, pending,
      barsSince: ev ? n - 1 - ev.at : null,
      bosCount: events.filter((e) => e.kind === "BOS" && e.dir === trend).length,
      hUnbroken: lastH && !lastH.broken ? lastH : null,
      lUnbroken: lastL && !lastL.broken ? lastL : null,
    };
  }

  function analyze(data, order) {
    const tfs = {};
    for (const tf of order) if (data[tf] && data[tf].length >= 12) tfs[tf] = analyzeTf(data[tf], tf);
    const w = { "1M": 3, "1w": 3, "1d": 2, "4h": 2, "1h": 1, "15m": 1 };
    let score = 0, tot = 0;
    for (const [tf, r] of Object.entries(tfs)) { score += r.trend * (w[tf] || 1); tot += w[tf] || 1; }
    const bias = tot ? score / tot : 0;
    return { tfs, bias, biasText: bias > 0.33 ? "Bullish" : bias < -0.33 ? "Bearish" : "Mixed" };
  }

  const api = { analyze, analyzeTf, PIV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StructureEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
