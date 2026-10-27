// Donchian breakout system (the one that tested positive on BTC 4H) — live replay.
// Exactly the rules of the Trend-following backtest:
//   entry  : a candle CLOSES above the highest high of the previous 20 candles (short: below the 20 low)
//   fill   : next candle's open
//   stop   : first stop 2×ATR(20) from the signal close, then trailed to the lowest low of the
//            last 10 candles (only ever moves up for longs); stop fills at the stop price, or at the
//            open if price gaps through it
// The replay is stateless: it re-runs recent history every time, so the alert job needs no database.
(function (root) {
  "use strict";

  function atrSeries(c, n = 20) {
    const out = new Array(c.length).fill(0);
    let s = 0;
    const tr = (i) => i === 0 ? c[0].h - c[0].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    for (let i = 0; i < c.length; i++) { s += tr(i); if (i >= n) s -= tr(i - n); out[i] = s / Math.min(i + 1, n); }
    return out;
  }

  // c = CLOSED candles only, oldest first: {t (sec), o, h, l, c}
  function replay(c, opts = {}) {
    const sides = opts.sides || "long";
    const warm = opts.warm == null ? 210 : opts.warm;
    const atr = atrSeries(c, 20);
    const events = [];
    const trades = [];
    let pos = null, pending = null;
    const closePos = (k, price, how) => {
      trades.push({ dir: pos.dir, t: c[pos.entryIdx].t, exitT: c[k].t, entry: pos.entry, stop0: pos.stop0, exit: price, how, r: pos.dir * (price - pos.entry) / pos.risk });
      events.push({ k, t: c[k].t, type: "exit", dir: pos.dir, price, entry: pos.entry, r: pos.dir * (price - pos.entry) / pos.risk, how });
      pos = null;
    };
    for (let k = 1; k < c.length; k++) {
      const x = c[k];
      if (pending && !pos) {
        if (pending.dir > 0 ? x.o > pending.stop : x.o < pending.stop) {
          pos = { dir: pending.dir, entry: x.o, entryIdx: k, stop: pending.stop, stop0: pending.stop, risk: Math.abs(x.o - pending.stop) };
          events.push({ k, t: x.t, type: "filled", dir: pos.dir, price: x.o, stop: pos.stop });
        } else events.push({ k, t: x.t, type: "skipped", dir: pending.dir, price: x.o, stop: pending.stop });
        pending = null;
      }
      if (pos) {
        if (pos.dir > 0 && x.l <= pos.stop) closePos(k, Math.min(x.o, pos.stop), "stop");
        else if (pos.dir < 0 && x.h >= pos.stop) closePos(k, Math.max(x.o, pos.stop), "stop");
      }
      if (k < warm) continue;
      const A = atr[k];
      if (pos) {
        let lo = Infinity, hi = -Infinity;
        for (let m = k - 9; m <= k; m++) { lo = Math.min(lo, c[m].l); hi = Math.max(hi, c[m].h); }
        const next = pos.dir > 0 ? Math.max(pos.stop, lo) : Math.min(pos.stop, hi);
        if (next !== pos.stop) { events.push({ k, t: x.t, type: "stop", dir: pos.dir, from: pos.stop, stop: next, price: x.c }); pos.stop = next; }
        continue;
      }
      let hi = -Infinity, lo = Infinity;
      for (let m = k - 20; m < k; m++) { hi = Math.max(hi, c[m].h); lo = Math.min(lo, c[m].l); }
      if (x.c > hi) { pending = { dir: 1, stop: x.c - 2 * A }; events.push({ k, t: x.t, type: "signal", dir: 1, price: x.c, level: hi, stop: pending.stop, atr: A }); }
      else if (sides === "both" && x.c < lo) { pending = { dir: -1, stop: x.c + 2 * A }; events.push({ k, t: x.t, type: "signal", dir: -1, price: x.c, level: lo, stop: pending.stop, atr: A }); }
    }
    // levels for the next candle
    const n = c.length, k = n - 1;
    let hi20 = -Infinity, lo20 = Infinity, lo10 = Infinity, hi10 = -Infinity;
    for (let m = Math.max(0, k - 19); m <= k; m++) { hi20 = Math.max(hi20, c[m].h); lo20 = Math.min(lo20, c[m].l); }
    for (let m = Math.max(0, k - 9); m <= k; m++) { lo10 = Math.min(lo10, c[m].l); hi10 = Math.max(hi10, c[m].h); }
    return {
      events, trades,
      position: pos ? { dir: pos.dir, entry: pos.entry, entryT: c[pos.entryIdx].t, stop: pos.stop, stop0: pos.stop0, risk: pos.risk, openR: pos.dir * (c[k].c - pos.entry) / pos.risk } : null,
      pending,
      last: c[k], atr: atr[k], hi20, lo20, lo10, hi10,
    };
  }

  const api = { replay, atrSeries };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DonchianCore = api;
})(typeof window !== "undefined" ? window : globalThis);
