// Top-down trend-line engine (rules from the "ray tool" top-down method)
//  - first down line starts at the highest high, first up line at the lowest low
//  - price may not cut through a line
//  - each new line starts where the previous one last touched (previous B = new A)
//  - work down timeframes: 1M -> 1W -> 1D -> 4H -> 1H -> 15m, refining points on each
// Candles: {t: unix seconds (open time), o, h, l, c}
(function (root) {
  "use strict";

  const TF = {
    "1M":  { sec: 30.44 * 86400, tail: 1, piv: 1, label: "1 month" },
    "1w":  { sec: 7 * 86400,     tail: 1, piv: 2, label: "1 week" },
    "1d":  { sec: 86400,         tail: 2, piv: 3, label: "1 day" },
    "4h":  { sec: 4 * 3600,      tail: 3, piv: 3, label: "4 hours" },
    "1h":  { sec: 3600,          tail: 3, piv: 3, label: "1 hour" },
    "15m": { sec: 900,           tail: 3, piv: 3, label: "15 min" },
  };
  const ORDER = ["1M", "1w", "1d", "4h", "1h", "15m"];
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const MAX_NEW_LINES = 4;   // new lines per side per timeframe
  const MAX_EPS_ATR = 0.75;  // a line may be "close enough" by at most this much

  function atr(c, n = 14) {
    if (c.length < 2) return c.length ? c[0].h - c[0].l : 0;
    let s = 0, k = 0;
    for (let i = Math.max(1, c.length - n); i < c.length; i++) {
      s += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
      k++;
    }
    return s / k;
  }

  // Price of the line through A and B at time t
  function lineAt(L, t) { return L.p1 + (L.p2 - L.p1) * (t - L.t1) / (L.t2 - L.t1); }

  // Convex hull walk from index a to index e (inclusive).
  // side "down": upper hull of highs (no high above the lines)
  // side "up":   lower hull of lows  (no low below the lines)
  function hullChain(c, a, e, side) {
    const val = side === "down" ? (k) => c[k].h : (k) => c[k].l;
    const st = [];
    for (let k = a; k <= e; k++) {
      while (st.length >= 2) {
        const i = st[st.length - 2], j = st[st.length - 1];
        const cross = (c[j].t - c[i].t) * (val(k) - val(i)) - (val(j) - val(i)) * (c[k].t - c[i].t);
        // upper hull: pop when k is on/above line i-j (cross >= 0); lower hull: pop when on/below
        if (side === "down" ? cross >= 0 : cross <= 0) st.pop(); else break;
      }
      st.push(k);
    }
    return st;
  }

  // Simplify a hull chain: drop vertices that sit less than eps (vertical) from the chord.
  // Lines are allowed to be "close enough" by eps, as in the video.
  function simplify(c, chain, side, eps) {
    if (chain.length <= 2) return chain.slice();
    const val = side === "down" ? (k) => c[k].h : (k) => c[k].l;
    const keep = new Array(chain.length).fill(false);
    keep[0] = keep[chain.length - 1] = true;
    const stack = [[0, chain.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      if (e - s < 2) continue;
      const A = chain[s], B = chain[e];
      let best = -1, bd = -1;
      for (let m = s + 1; m < e; m++) {
        const k = chain[m];
        const y = val(A) + (val(B) - val(A)) * (c[k].t - c[A].t) / (c[B].t - c[A].t);
        const d = Math.abs(val(k) - y);
        if (d > bd) { bd = d; best = m; }
      }
      if (bd > eps) { keep[best] = true; stack.push([s, best], [best, e]); }
    }
    return chain.filter((_, m) => keep[m]);
  }

  // Build new lines on one timeframe starting from candle index a
  function linesFrom(c, a, side, tfKey) {
    const cfg = TF[tfKey];
    const e = c.length - 1 - cfg.tail;                 // last candle used to fit lines
    const minAfter = cfg.tail >= 2 ? 2 : 1;            // a touch point needs candles after it
    if (e - a < 2) return [];
    const val = side === "down" ? (k) => c[k].h : (k) => c[k].l;
    // price already went beyond the starting point: restart from the new extreme
    let restarted = false;
    const m0 = extremeIndex(c, a, e, side);
    if (m0 !== a && (side === "down" ? c[m0].h > c[a].h : c[m0].l < c[a].l)) { a = m0; restarted = true; }
    if (e - a < 2) return [];
    let chain = hullChain(c, a, e, side);
    // a touch point needs confirmed candles after it
    while (chain.length > 2 && chain[chain.length - 1] > e - minAfter) chain.pop();
    if (chain.length < 2) return [];
    let eps = atr(c) * 0.25;
    let s = simplify(c, chain, side, eps);
    const epsMax = atr(c) * MAX_EPS_ATR;
    for (let g = 0; g < 12; g++) {
      // drop trailing vertices that are too close to the end to be confirmed
      while (s.length > 2 && s[s.length - 1] > e - minAfter) s.pop();
      if (s.length - 1 <= MAX_NEW_LINES || eps >= epsMax) break;
      eps = Math.min(eps * 1.6, epsMax);
      s = simplify(c, chain, side, eps);
    }
    while (s.length > 2 && s[s.length - 1] > e - minAfter) s.pop();
    let cut = false;
    // too many lines: keep the most recent ones (they matter most for entries)
    if (s.length - 1 > MAX_NEW_LINES) { s = s.slice(s.length - 1 - MAX_NEW_LINES); cut = true; }
    const out = [];
    for (let m = 0; m + 1 < s.length; m++) {
      const i = s[m], j = s[m + 1];
      if (c[j].t === c[i].t) continue;
      out.push({ side, tf: tfKey, t1: c[i].t, p1: val(i), t2: c[j].t, p2: val(j), ia: i, ib: j });
    }
    if ((cut || restarted) && out.length) out[0].cut = true;
    return out;
  }

  // Find the candle on this timeframe that holds a higher-timeframe extreme
  function refine(c, t, durSec, side, price) {
    let best = -1;
    for (let k = 0; k < c.length; k++) {
      if (c[k].t < t - 1) continue;
      if (c[k].t >= t + durSec - 1) break;
      if (best < 0) best = k;
      else if (side === "down" ? c[k].h > c[best].h : c[k].l < c[best].l) best = k;
    }
    if (best < 0) return -1;
    // the refined candle should be (close to) the same extreme
    const v = side === "down" ? c[best].h : c[best].l;
    if (Math.abs(v - price) > Math.abs(price) * 0.02) return -1;
    return best;
  }

  function extremeIndex(c, from, to, side) {
    let b = from;
    for (let k = from; k <= to; k++) if (side === "down" ? c[k].h > c[b].h : c[k].l < c[b].l) b = k;
    return b;
  }

  // Swing structure: higher highs / higher lows etc.
  function structure(c, p) {
    const H = [], Lo = [];
    for (let i = p; i < c.length - p; i++) {
      let hi = true, lo = true;
      for (let k = i - p; k <= i + p; k++) {
        if (k === i) continue;
        if (c[k].h >= c[i].h) hi = false;
        if (c[k].l <= c[i].l) lo = false;
      }
      if (hi) H.push(i);
      if (lo) Lo.push(i);
    }
    let trend = "Sideways";
    if (H.length >= 2 && Lo.length >= 2) {
      const hh = c[H[H.length - 1]].h > c[H[H.length - 2]].h;
      const hl = c[Lo[Lo.length - 1]].l > c[Lo[Lo.length - 2]].l;
      if (hh && hl) trend = "Up";
      else if (!hh && !hl) trend = "Down";
    }
    return { trend, highs: H, lows: Lo };
  }

  function lineStatus(c, L, tfKey, a) {
    if (!L) return null;
    const cfg = TF[tfKey];
    const n = c.length;
    const last = c[n - 1];
    const v = lineAt(L, last.t);
    const up = L.side === "up";
    let status = "Respecting";
    // closed candles after the fitted range: a close on the wrong side = violated
    for (let k = Math.max(0, n - 1 - cfg.tail); k < n - 1; k++) {
      const lv = lineAt(L, c[k].t);
      if (up ? c[k].c < lv : c[k].c > lv) status = "Broken";
    }
    if (status !== "Broken") {
      const lvNow = v;
      if (up ? last.c < lvNow : last.c > lvNow) status = "Breaking";
      else if (up ? last.l <= lvNow : last.h >= lvNow) status = "Testing";
      else if (Math.abs(last.c - lvNow) <= a * 0.6) status = "At line";
    }
    // touch count: candles that came within 0.15 ATR of the line after point A
    let touches = 0, lastTouch = -10;
    for (let k = 0; k < n; k++) {
      if (c[k].t < L.t1) continue;
      const lv = lineAt(L, c[k].t);
      const d = up ? c[k].l - lv : lv - c[k].h;
      if (Math.abs(d) <= a * 0.15 && k - lastTouch > 1) { touches++; lastTouch = k; }
    }
    return { status, value: v, distATR: (last.c - v) / a, touches };
  }

  // Auto Fibonacci: the latest swing inside a look-back window (like TradingView's Auto Fib)
  // upswing (low then high): levels measured back down from the high; downswing: up from the low
  function fibFor(c, tfKey) {
    if (c.length < 5) return null;
    const W = tfKey === "1M" || tfKey === "1w" ? c.length : Math.min(c.length, 200);
    const s0 = c.length - W;
    let hi = s0, lo = s0;
    for (let k = s0; k < c.length; k++) { if (c[k].h > c[hi].h) hi = k; if (c[k].l < c[lo].l) lo = k; }
    const dir = lo < hi ? "up" : "down";
    const a = dir === "up" ? lo : hi, b = dir === "up" ? hi : lo;
    const from = dir === "up" ? c[a].l : c[a].h;
    const to = dir === "up" ? c[b].h : c[b].l;
    const levels = FIB.map((r) => ({ r, price: to - (to - from) * r }));
    const price = c[c.length - 1].c;
    const retr = (to - price) / (to - from || 1);
    return { dir, t1: c[a].t, t2: c[b].t, from, to, levels, retrace: retr };
  }

  // Main: data = { "1M": candles, "1w": candles, ... } (any subset, in ORDER)
  function analyze(data) {
    const result = { tfs: {} };
    let prev = { up: [], down: [] };       // full chains so far (lines)
    let prevTf = null;
    for (const tf of ORDER) {
      const c = data[tf];
      if (!c || c.length < 5) continue;
      const a = atr(c);
      const tfRes = { lines: [], structure: structure(c, TF[tf].piv), atr: a, start: {} };
      for (const side of ["down", "up"]) {
        const chain = prev[side];
        let carried = [], startIdx = -1, linked = true;
        if (!prevTf) {
          startIdx = extremeIndex(c, 0, c.length - 1 - TF[tf].tail, side);
        } else {
          // vertices of the higher-timeframe chain (A of first line, then each B)
          const verts = [];
          chain.forEach((L, m) => {
            if (m === 0) verts.push({ t: L.t1, p: L.p1, dur: L.durA, line: m });
            verts.push({ t: L.t2, p: L.p2, dur: L.durB, line: m + 1 });
          });
          let picked = null;
          for (const v of verts) {
            if (v.t < c[0].t) continue;
            const k = refine(c, v.t, v.dur, side, v.p);
            if (k >= 0 && k < c.length - 1 - TF[tf].tail - 2) { picked = { v, k }; break; }
          }
          if (picked) {
            carried = chain.slice(0, picked.v.line);
            startIdx = picked.k;
          } else {
            carried = chain.slice();
            // last higher-TF touch is older than this chart: start from this chart's extreme
            const lastT = chain.length ? chain[chain.length - 1].t2 : -Infinity;
            let from = 0;
            while (from < c.length && c[from].t <= lastT) from++;
            if (from < c.length - 1 - TF[tf].tail - 2) {
              startIdx = extremeIndex(c, from, c.length - 1 - TF[tf].tail, side);
              linked = chain.length === 0;
              // only valid if it doesn't sit beyond the last carried ray
              const Lc = carried[carried.length - 1];
              if (Lc) {
                const v = side === "down" ? c[startIdx].h : c[startIdx].l;
                const lv = lineAt(Lc, c[startIdx].t);
                if (side === "down" ? v > lv : v < lv) startIdx = -1;
              }
            }
          }
        }
        let fresh = startIdx >= 0 ? linesFrom(c, startIdx, side, tf) : [];
        fresh.forEach((L) => { L.durA = TF[tf].sec; L.durB = TF[tf].sec; L.linked = linked && !L.cut; });
        // nothing new on this timeframe: keep every higher-timeframe line
        const full = fresh.length ? carried.concat(fresh) : chain.slice();
        prev[side] = full;
        tfRes.start[side] = startIdx;
        tfRes.lines.push(...full);
        const active = full[full.length - 1] || null;
        tfRes[side === "up" ? "upLine" : "downLine"] = active;
        tfRes[side === "up" ? "upStatus" : "downStatus"] = lineStatus(c, active, tf, a);
      }
      tfRes.fib = fibFor(c, tf);
      tfRes.setup = setupText(tfRes, c);
      result.tfs[tf] = tfRes;
      prevTf = tf;
    }
    result.overall = overall(result);
    return result;
  }

  function setupText(r, c) {
    const t = r.structure.trend, u = r.upStatus, d = r.downStatus;
    if (u && (u.status === "Broken" || u.status === "Breaking")) return { tone: "bear", text: "Up line violated — trend-line exit / no longs" };
    if (d && (d.status === "Broken" || d.status === "Breaking")) return { tone: "bull", text: "Down line violated — downtrend weakening" };
    if (u && (u.status === "At line" || u.status === "Testing") && t !== "Down") return { tone: "bull", text: "Price at up action line — bounce setup (buy zone)" };
    if (d && (d.status === "At line" || d.status === "Testing") && t !== "Up") return { tone: "bear", text: "Price at down action line — bounce setup (sell zone)" };
    return { tone: "neutral", text: "Between lines — wait for price to reach a line" };
  }

  function overall(res) {
    const votes = { Up: 0, Down: 0, Sideways: 0 };
    const w = { "1M": 3, "1w": 3, "1d": 2, "4h": 2, "1h": 1, "15m": 1 };
    for (const [tf, r] of Object.entries(res.tfs)) votes[r.structure.trend] += w[tf] || 1;
    const best = Object.entries(votes).sort((x, y) => y[1] - x[1])[0][0];
    return { trend: best, votes };
  }

  const api = { analyze, lineAt, TF, ORDER, FIB, atr, hullChain, simplify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrendEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
