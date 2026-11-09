// Smart Money Concepts add-ons for the Structure tab
//  - Fibonacci on the leg that printed the last BOS/CHoCH (premium / discount / OTE)
//  - HTF liquidity: previous day/week/month highs & lows, equal highs/lows, untaken swing highs/lows, sweeps
//  - Volume: relative volume spikes, volume profile (POC / value area)
//  - Fair Value Gaps (3-candle imbalances) that are still open
(function (root) {
  "use strict";
  const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1];

  function atr(c, n = 14) {
    let s = 0, k = 0;
    for (let i = Math.max(1, c.length - n); i < c.length; i++) {
      s += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)); k++;
    }
    return k ? s / k : (c[0] ? c[0].h - c[0].l : 0);
  }

  // Fib on the impulse leg behind the latest break
  // bullish: from the pullback low before the break up to the highest high since -> 0 at the high, 1 at the low
  function bosFib(c, R) {
    const e = R.last;
    if (!e) return null;
    const n = c.length;
    let a, b;
    if (e.dir > 0) {
      a = e.from + 1; for (let k = e.from + 1; k <= e.at; k++) if (c[k].l < c[a].l) a = k;
      b = e.at;       for (let k = e.at; k < n; k++) if (c[k].h > c[b].h) b = k;
    } else {
      a = e.from + 1; for (let k = e.from + 1; k <= e.at; k++) if (c[k].h > c[a].h) a = k;
      b = e.at;       for (let k = e.at; k < n; k++) if (c[k].l < c[b].l) b = k;
    }
    if (a > n - 1) return null;
    const lo = e.dir > 0 ? c[a].l : c[b].l, hi = e.dir > 0 ? c[b].h : c[a].h;
    const range = hi - lo;
    if (!(range > 0)) return null;
    // levels are measured from the end of the leg back toward its start (retracement)
    const end = e.dir > 0 ? hi : lo, start = e.dir > 0 ? lo : hi;
    const levels = FIBS.map((r) => ({ r, price: end - (end - start) * r }));
    const price = c[n - 1].c;
    const retr = (end - price) / (end - start);
    const eq = (hi + lo) / 2;
    const zone = price > eq ? "Premium" : "Discount";
    const ote = retr >= 0.618 && retr <= 0.786;
    return { dir: e.dir, kind: e.kind, tStart: c[a].t, tEnd: c[b].t, start, end, hi, lo, levels, retrace: retr, eq, zone, ote,
      // a bullish leg wants price back in discount to buy, a bearish leg wants premium to sell
      good: e.dir > 0 ? price < eq : price > eq };
  }

  // Liquidity levels from higher timeframes
  function liquidity(data, struct, tf, price) {
    const out = [];
    const add = (o) => { if (o.price != null && isFinite(o.price)) out.push(o); };
    const cur = data[tf];
    // which candles count as "since the level formed" -> use the selected timeframe
    const since = (t, test) => {
      if (!cur) return false;
      for (let k = cur.length - 1; k >= 0 && cur[k].t >= t; k--) if (test(cur[k])) return true;
      return false;
    };
    for (const [key, H, L, tfk] of [["Day", "PDH", "PDL", "1d"], ["Week", "PWH", "PWL", "1w"], ["Month", "PMH", "PML", "1M"]]) {
      const d = data[tfk];
      if (!d || d.length < 2) continue;
      const p = d[d.length - 2], now = d[d.length - 1];
      add({ price: p.h, side: "buy", tag: H, name: `Previous ${key} High`, swept: now.h > p.h, htf: tfk });
      add({ price: p.l, side: "sell", tag: L, name: `Previous ${key} Low`, swept: now.l < p.l, htf: tfk });
    }
    // equal highs / lows and untaken swing points on 4H and 1D
    for (const tfk of ["1d", "4h"]) {
      const d = data[tfk], S = struct.tfs[tfk];
      if (!d || !S) continue;
      const a = atr(d);
      const tol = Math.max(a * 0.1, d[d.length - 1].c * 0.0007);
      for (const type of ["H", "L"]) {
        const sw = S.swings.filter((w) => w.type === type).slice(-30);
        const taken = (w) => {
          for (let k = w.i + 1; k < d.length; k++) if (type === "H" ? d[k].h > w.price : d[k].l < w.price) return true;
          return false;
        };
        const open = sw.filter((w) => !taken(w));
        // equal highs/lows: two untaken swings within tolerance
        const used = new Set();
        for (let x = 0; x < open.length; x++) for (let y = x + 1; y < open.length; y++) {
          if (used.has(x) || used.has(y)) continue;
          if (Math.abs(open[x].price - open[y].price) <= tol) {
            used.add(x); used.add(y);
            const pr = type === "H" ? Math.max(open[x].price, open[y].price) : Math.min(open[x].price, open[y].price);
            add({ price: pr, side: type === "H" ? "buy" : "sell", tag: `${type === "H" ? "EQH" : "EQL"} ${tfk.toUpperCase()}`, name: `Equal ${type === "H" ? "highs" : "lows"} (${tfk.toUpperCase()})`, swept: false, htf: tfk, t: open[y].t, strong: true });
          }
        }
        // the nearest untaken swing high above / low below price
        const cand = open.filter((w, i) => !used.has(i) && (type === "H" ? w.price > price : w.price < price))
          .sort((p, q) => Math.abs(p.price - price) - Math.abs(q.price - price)).slice(0, 2);
        cand.forEach((w) => add({ price: w.price, side: type === "H" ? "buy" : "sell", tag: `${type === "H" ? "BSL" : "SSL"} ${tfk.toUpperCase()}`, name: `${type === "H" ? "Buy-side" : "Sell-side"} liquidity (${tfk.toUpperCase()} swing ${type === "H" ? "high" : "low"})`, swept: false, htf: tfk, t: w.t }));
      }
    }
    // de-duplicate levels that sit on top of each other
    out.sort((p, q) => p.price - q.price);
    const ded = [];
    for (const o of out) {
      const prev = ded[ded.length - 1];
      if (prev && Math.abs(prev.price - o.price) / o.price < 0.0008 && prev.side === o.side) { prev.tag += " · " + o.tag; prev.strong = prev.strong || o.strong; continue; }
      ded.push({ ...o });
    }
    ded.forEach((o) => { o.dist = (o.price - price) / price * 100; });
    return ded;
  }

  // Liquidity sweep: a recent candle wicked through a level but closed back on the other side
  function sweeps(c, levels, look = 6) {
    const out = [];
    for (let k = Math.max(0, c.length - look); k < c.length; k++) {
      for (const L of levels) {
        if (L.side === "buy" && c[k].h > L.price && c[k].c < L.price && c[k].o < L.price) out.push({ at: k, t: c[k].t, dir: -1, level: L });
        if (L.side === "sell" && c[k].l < L.price && c[k].c > L.price && c[k].o > L.price) out.push({ at: k, t: c[k].t, dir: 1, level: L });
      }
    }
    return out;
  }

  // Relative volume and a simple volume profile of the last `n` candles
  function volume(c, n = 200, bins = 48) {
    const m = c.length;
    const rv = c.map((x, i) => {
      const s0 = Math.max(0, i - 20); let s = 0, k = 0;
      for (let j = s0; j < i; j++) { s += c[j].v; k++; }
      return k ? x.v / (s / k || 1) : 1;
    });
    const s0 = Math.max(0, m - n);
    let lo = Infinity, hi = -Infinity;
    for (let i = s0; i < m; i++) { lo = Math.min(lo, c[i].l); hi = Math.max(hi, c[i].h); }
    const step = (hi - lo) / bins || 1;
    const hist = new Array(bins).fill(0);
    for (let i = s0; i < m; i++) {
      // spread each candle's volume across the price range it traded
      const a = Math.max(0, Math.floor((c[i].l - lo) / step)), b = Math.min(bins - 1, Math.floor((c[i].h - lo) / step));
      const share = c[i].v / (b - a + 1);
      for (let j = a; j <= b; j++) hist[j] += share;
    }
    let poc = 0; for (let j = 1; j < bins; j++) if (hist[j] > hist[poc]) poc = j;
    const total = hist.reduce((x, y) => x + y, 0);
    let va = hist[poc], L = poc, H = poc;
    while (va < total * 0.7 && (L > 0 || H < bins - 1)) {
      const dn = L > 0 ? hist[L - 1] : -1, up = H < bins - 1 ? hist[H + 1] : -1;
      if (up >= dn) { H++; va += hist[H]; } else { L--; va += hist[L]; }
    }
    const mid = (j) => lo + (j + 0.5) * step;
    return { rv, rvNow: rv[m - 1], rvPrev: rv[m - 2], poc: mid(poc), vah: lo + (H + 1) * step, val: lo + L * step, hist, lo, step, from: c[s0].t };
  }

  // Fair Value Gaps still open (not fully filled)
  function fvgs(c, maxAge = 300) {
    const a = atr(c);
    const out = [];
    const s0 = Math.max(2, c.length - maxAge);
    for (let i = s0; i < c.length; i++) {
      const p2 = c[i - 2], x = c[i];
      let g = null;
      if (x.l > p2.h && x.l - p2.h >= a * 0.15) g = { dir: 1, top: x.l, bot: p2.h, i, t: c[i - 1].t };
      if (x.h < p2.l && p2.l - x.h >= a * 0.15) g = { dir: -1, top: p2.l, bot: x.h, i, t: c[i - 1].t };
      if (!g) continue;
      // fill check on later candles; track how deep price came back into the gap
      let filled = false, deepest = g.dir > 0 ? g.top : g.bot;
      for (let k = i + 1; k < c.length; k++) {
        if (g.dir > 0) { deepest = Math.min(deepest, c[k].l); if (c[k].l <= g.bot) { filled = true; break; } }
        else { deepest = Math.max(deepest, c[k].h); if (c[k].h >= g.top) { filled = true; break; } }
      }
      if (filled) continue;
      // keep the unfilled part only
      if (g.dir > 0) g.top = Math.min(g.top, deepest); else g.bot = Math.max(g.bot, deepest);
      if (g.top - g.bot > 0) out.push(g);
    }
    return out;
  }


  // Order blocks: the last opposite candle before the impulse that printed a BOS/CHoCH
  // bullish OB = last down-close candle at the low of the move that broke a swing high (zone = its high..low)
  // kept while no candle has closed through it; "tested" once price came back into the zone
  function orderBlocks(c, R, maxAge = 500) {
    const out = [], seen = new Set();
    for (const e of R.events) {
      if (e.at < c.length - maxAge) continue;
      let a = e.from;
      for (let k = e.from; k <= e.at; k++) if (e.dir > 0 ? c[k].l < c[a].l : c[k].h > c[a].h) a = k;
      let ob = -1;
      for (let k = a; k >= Math.max(0, a - 10); k--) {
        if (e.dir > 0 ? c[k].c < c[k].o : c[k].c > c[k].o) { ob = k; break; }
      }
      if (ob < 0) ob = a;
      if (seen.has(ob)) continue;
      seen.add(ob);
      const top = c[ob].h, bot = c[ob].l;
      let broken = false, tested = false;
      for (let k = e.at + 1; k < c.length; k++) {
        if (e.dir > 0) { if (c[k].c < bot) { broken = true; break; } if (c[k].l <= top) tested = true; }
        else { if (c[k].c > top) { broken = true; break; } if (c[k].h >= bot) tested = true; }
      }
      if (broken) continue;
      out.push({ dir: e.dir, top, bot, i: ob, t: c[ob].t, kind: e.kind, tested, at: e.at });
    }
    return out;
  }

  // Confluence checklist for the selected timeframe
  function confluence(R, fib, sw, fv, bias, price, obs, ray) {
    if (!R.last) return null;
    const up = R.trend > 0;
    const items = [];
    items.push({ ok: Math.sign(bias) === Math.sign(R.trend) && Math.abs(bias) > 0.33, text: `Higher-timeframe bias is ${up ? "bullish" : "bearish"}` });
    items.push({ ok: R.last.kind === "BOS" && R.last.dir === R.trend, text: `Latest break is a BOS ${up ? "up" : "down"} (trend continuation)` });
    items.push({ ok: !!(fib && fib.good), text: `Price is in ${up ? "discount (below 50%)" : "premium (above 50%)"} of the BOS leg` });
    items.push({ ok: !!(fib && fib.ote), text: "Price is in the OTE zone (61.8%–78.6%)" });
    items.push({ ok: sw.some((s) => s.dir === R.trend), text: `Recent ${up ? "sell-side" : "buy-side"} liquidity sweep` });
    items.push({ ok: fv.some((g) => g.dir === R.trend && (up ? g.top < price * 1.0 + 1e-9 : g.bot > price - 1e-9) && Math.abs((up ? g.top : g.bot) - price) / price < 0.03), text: `Open ${up ? "bullish" : "bearish"} FVG nearby (${up ? "below" : "above"} price)` });
    const near = (z) => price <= z.top * 1.003 && price >= z.bot * 0.997;
    items.push({ ok: (obs || []).some((z) => z.dir === R.trend && near(z)), text: `Price is at a ${up ? "bullish" : "bearish"} order block` });
    if (ray) {
      const st = up ? ray.upStatus : ray.downStatus;
      const against = up ? ray.downStatus : ray.upStatus;
      items.push({ ok: !!(st && (st.status === "At line" || st.status === "Testing")), text: `Price is at the ${up ? "up" : "down"} trend ray (bounce zone)` });
      void against;
    }
    return { dir: R.trend, items, score: items.filter((x) => x.ok).length, total: items.length };
  }

  const api = { bosFib, liquidity, sweeps, volume, fvgs, orderBlocks, confluence, FIBS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SMC = api;
})(typeof window !== "undefined" ? window : globalThis);
