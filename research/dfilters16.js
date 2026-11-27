(function (root) {
  "use strict";
  const SE = root.StructureEngine || (typeof require !== "undefined" ? require("./structure.js") : null);
  const TE = root.TrendEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const SMC = root.SMC || (typeof require !== "undefined" ? require("./smc.js") : null);

  const FILTERS = {
    structure: { name: "Structure", text: "1D structure is bullish (latest daily BOS/CHoCH up)" },
    rays: { name: "Trend lines", text: "Above the 4H down ray and the 4H up ray still holds" },
    liquidity: { name: "Liquidity & gaps", text: "Open buy-side liquidity above, no bearish FVG just overhead" },
    volume: { name: "Volume", text: "Signal candle volume above its 20-candle average" },
    fib: { name: "Fib", text: "Not in premium — at or below 0.79 of the 60-day range" },
    osc: { name: "Oscillators", text: "Oscillators summary is Buy or Strong buy" },
    above50: { name: "50-day average", text: "Last daily close above its 50-day average (below for sells)" },
    above200: { name: "200-day average", text: "Last daily close above its 200-day average (below for sells)" },
    ema: { name: "EMA 20/50", text: "EMA 20 above EMA 50 on the test timeframe" },
    supertrend: { name: "Supertrend", text: "Supertrend (10, 3) is green (red for sells)" },
    adx: { name: "ADX trend strength", text: "ADX(14) above 20 — trending, not sideways" },
    rsi: { name: "RSI", text: "RSI(14) above 50 (below for sells)" },
    macd: { name: "MACD", text: "MACD (12, 26) above its signal line (below for sells)" },
    vwap: { name: "VWAP from high", text: "Close above the VWAP anchored at the 200-candle high (from the low for sells)" },
    bb: { name: "Bollinger Bands", text: "Close above the middle band (20, 2) and the bands widening" },
    ichimoku: { name: "Ichimoku cloud", text: "Close above the cloud (below for sells)" },
  };
  const KEYS = Object.keys(FILTERS);
  const TF_SEC = { "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };

  // ---------- series helpers ----------
  const sma = (a, n) => { const o = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const ema = (a, n) => { const o = new Array(a.length); const k = 2 / (n + 1); for (let i = 0; i < a.length; i++) o[i] = i === 0 ? a[0] : a[i] * k + o[i - 1] * (1 - k); return o; };
  const rma = (a, n) => { const o = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { if (i < n) { s += a[i]; if (i === n - 1) o[i] = s / n; } else o[i] = (o[i - 1] * (n - 1) + a[i]) / n; } return o; };
  const hh = (c, i, n, f) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, f(c[j])); return m; };
  const ll = (c, i, n, f) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, f(c[j])); return m; };
  function rsiSeries(src, n = 14) {
    const up = src.map((x, i) => i ? Math.max(0, x - src[i - 1]) : 0), dn = src.map((x, i) => i ? Math.max(0, src[i - 1] - x) : 0);
    const u = rma(up, n), d = rma(dn, n);
    return u.map((x, i) => d[i] === 0 ? 100 : 100 - 100 / (1 + x / d[i]));
  }
  function atrSeries(c, n = 20) {
    const out = new Array(c.length).fill(0); let s = 0;
    const tr = (i) => i === 0 ? c[0].h - c[0].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    for (let i = 0; i < c.length; i++) { s += tr(i); if (i >= n) s -= tr(i - n); out[i] = s / Math.min(i + 1, n); }
    return out;
  }

  // TradingView "Technical Ratings" style oscillators summary: each oscillator votes +1 / 0 / -1,
  // the rating is the average. > 0.1 = Buy, > 0.5 = Strong buy, < -0.1 = Sell, < -0.5 = Strong sell.
  function oscRating(c) {
    const n = c.length, C = c.map((x) => x.c), H = c.map((x) => x.h), L = c.map((x) => x.l);
    const rsi = rsiSeries(C, 14);
    const stRaw = c.map((x, i) => { const a = hh(c, i, 14, (y) => y.h), b = ll(c, i, 14, (y) => y.l); return a > b ? (x.c - b) / (a - b) * 100 : 50; });
    const stK = sma(stRaw, 3), stD = sma(stK, 3);
    const tp = c.map((x) => (x.h + x.l + x.c) / 3), tpS = sma(tp, 20);
    const cci = tp.map((x, i) => { if (i < 19) return 0; let md = 0; for (let j = i - 19; j <= i; j++) md += Math.abs(tp[j] - tpS[i]); md /= 20; return md ? (x - tpS[i]) / (0.015 * md) : 0; });
    const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l);
    const pdm = c.map((x, i) => { if (!i) return 0; const u = x.h - c[i - 1].h, d = c[i - 1].l - x.l; return u > d && u > 0 ? u : 0; });
    const mdm = c.map((x, i) => { if (!i) return 0; const u = x.h - c[i - 1].h, d = c[i - 1].l - x.l; return d > u && d > 0 ? d : 0; });
    const trR = rma(tr, 14), pR = rma(pdm, 14), mR = rma(mdm, 14);
    const pdi = pR.map((x, i) => trR[i] ? 100 * x / trR[i] : 0), mdi = mR.map((x, i) => trR[i] ? 100 * x / trR[i] : 0);
    const dx = pdi.map((x, i) => (x + mdi[i]) ? 100 * Math.abs(x - mdi[i]) / (x + mdi[i]) : 0);
    const adx = rma(dx.map((x) => isNaN(x) ? 0 : x), 14);
    const hl2 = c.map((x) => (x.h + x.l) / 2), s34 = sma(hl2, 34), ao = sma(hl2, 5).map((x, i) => x - s34[i]);
    const e12 = ema(C, 12), e26 = ema(C, 26), macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9);
    const srRaw = rsi.map((x, i) => { let a = -Infinity, b = Infinity; for (let j = Math.max(0, i - 13); j <= i; j++) { a = Math.max(a, rsi[j]); b = Math.min(b, rsi[j]); } return a > b ? (x - b) / (a - b) * 100 : 50; });
    const srK = sma(srRaw, 3), srD = sma(srK, 3);
    const e13 = ema(C, 13), e50 = ema(C, 50);
    const bull = H.map((x, i) => x - e13[i]), bear = L.map((x, i) => x - e13[i]);
    const bp = c.map((x, i) => i ? x.c - Math.min(x.l, c[i - 1].c) : 0), trU = c.map((x, i) => i ? Math.max(x.h, c[i - 1].c) - Math.min(x.l, c[i - 1].c) : x.h - x.l);
    const sumN = (a, i, m) => { let s = 0; for (let j = Math.max(0, i - m + 1); j <= i; j++) s += a[j]; return s; };
    const out = new Array(n).fill(0);
    for (let i = 35; i < n; i++) {
      const up = C[i] > e50[i];
      const v = [];
      v.push(rsi[i] < 30 && rsi[i] > rsi[i - 1] ? 1 : rsi[i] > 70 && rsi[i] < rsi[i - 1] ? -1 : 0);
      v.push(stK[i] < 20 && stD[i] < 20 && stK[i] > stD[i] ? 1 : stK[i] > 80 && stD[i] > 80 && stK[i] < stD[i] ? -1 : 0);
      v.push(cci[i] < -100 && cci[i] > cci[i - 1] ? 1 : cci[i] > 100 && cci[i] < cci[i - 1] ? -1 : 0);
      v.push(adx[i] > 20 && pdi[i - 1] < mdi[i - 1] && pdi[i] > mdi[i] ? 1 : adx[i] > 20 && pdi[i - 1] > mdi[i - 1] && pdi[i] < mdi[i] ? -1 : 0);
      const aoBuy = (ao[i] > 0 && ao[i - 1] <= 0) || (ao[i] > 0 && ao[i - 1] > 0 && ao[i] > ao[i - 1] && ao[i - 2] > ao[i - 1]);
      const aoSell = (ao[i] < 0 && ao[i - 1] >= 0) || (ao[i] < 0 && ao[i - 1] < 0 && ao[i] < ao[i - 1] && ao[i - 2] < ao[i - 1]);
      v.push(aoBuy ? 1 : aoSell ? -1 : 0);
      const mom = C[i] - C[i - 10], momP = C[i - 1] - C[i - 11];
      v.push(mom > momP ? 1 : mom < momP ? -1 : 0);
      v.push(macd[i] > sig[i] ? 1 : macd[i] < sig[i] ? -1 : 0);
      v.push(!up && srK[i] < 20 && srD[i] < 20 && srK[i] > srD[i] ? 1 : up && srK[i] > 80 && srD[i] > 80 && srK[i] < srD[i] ? -1 : 0);
      const wr = (a, b, x) => a > b ? (a - x) / (a - b) * -100 : -50;
      const w0 = wr(hh(c, i, 14, (y) => y.h), ll(c, i, 14, (y) => y.l), C[i]), w1 = wr(hh(c, i - 1, 14, (y) => y.h), ll(c, i - 1, 14, (y) => y.l), C[i - 1]);
      v.push(w0 < -80 && w0 > w1 ? 1 : w0 > -20 && w0 < w1 ? -1 : 0);
      v.push(up && bear[i] < 0 && bear[i] > bear[i - 1] ? 1 : !up && bull[i] > 0 && bull[i] < bull[i - 1] ? -1 : 0);
      const a7 = sumN(bp, i, 7) / (sumN(trU, i, 7) || 1), a14 = sumN(bp, i, 14) / (sumN(trU, i, 14) || 1), a28 = sumN(bp, i, 28) / (sumN(trU, i, 28) || 1);
      const uo = 100 * (4 * a7 + 2 * a14 + a28) / 7;
      v.push(uo > 70 ? 1 : uo < 30 ? -1 : 0);
      out[i] = v.reduce((a, b) => a + b, 0) / v.length;
    }
    return out;
  }
  const oscLabel = (r) => r > 0.5 ? "Strong buy" : r > 0.1 ? "Buy" : r < -0.5 ? "Strong sell" : r < -0.1 ? "Sell" : "Neutral";

  // ---------- context shared by all filters ----------
  function context(data, tf) {
    const c = data[tf], dc = data["1d"] || [], sec = TF_SEC[tf];
    const S = SE.analyzeTf(c, tf), p = SE.PIV[tf] || 3;
    const sw4 = S.swings.map((w) => ({ ...w, conf: w.i + p }));
    const D = dc.length >= 30 ? SE.analyzeTf(dc, "1d") : { events: [], swings: [] };
    const pd = SE.PIV["1d"] || 3;
    const dEv = D.events.map((e) => ({ known: dc[e.at].t + 86400, dir: e.dir }));
    const swD = D.swings.map((w) => ({ ...w, known: dc[Math.min(dc.length - 1, w.i + pd)].t + 86400 }));
    const vol = c.map((x) => x.v || 0);
    const hasVol = vol.some((x) => x > 0);
    return Object.assign({ c, dc, sec, tf, sw4, dEv, swD, atr: atrSeries(c, 20), vol, hasVol, osc: oscRating(c), cache: new Map() }, indicators(c, dc, hasVol));
  }

  // series for the extra indicator filters (each value uses only candles up to that index)
  function indicators(c, dc, hasVol) {
    const n = c.length, C = c.map((x) => x.c), dC = dc.map((x) => x.c);
    const o = { dS50: sma(dC, 50), dS200: sma(dC, 200), e20: ema(C, 20), e50: ema(C, 50), rsi: rsiSeries(C, 14) };
    const e12 = ema(C, 12), e26 = ema(C, 26);
    o.macd = e12.map((x, i) => x - e26[i]); o.sig = ema(o.macd, 9);
    // Donchian windows: 20-candle high/low before k, 10-candle low/high up to k
    o.hi20 = new Float64Array(n); o.lo20 = new Float64Array(n); o.lo10 = new Float64Array(n); o.hi10 = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let h = -Infinity, l = Infinity; for (let m = Math.max(0, k - 20); m < k; m++) { h = Math.max(h, c[m].h); l = Math.min(l, c[m].l); }
      o.hi20[k] = h; o.lo20[k] = l;
      h = -Infinity; l = Infinity; for (let m = Math.max(0, k - 9); m <= k; m++) { h = Math.max(h, c[m].h); l = Math.min(l, c[m].l); }
      o.hi10[k] = h; o.lo10[k] = l;
    }
    // true range, ADX(14), Supertrend(10, 3)
    const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l);
    const pdm = c.map((x, i) => { if (!i) return 0; const u = x.h - c[i - 1].h, d = c[i - 1].l - x.l; return u > d && u > 0 ? u : 0; });
    const mdm = c.map((x, i) => { if (!i) return 0; const u = x.h - c[i - 1].h, d = c[i - 1].l - x.l; return d > u && d > 0 ? d : 0; });
    const trR = rma(tr, 14), pR = rma(pdm, 14), mR = rma(mdm, 14);
    const dx = trR.map((t, i) => { const p = t ? 100 * pR[i] / t : 0, m = t ? 100 * mR[i] / t : 0; return p + m ? 100 * Math.abs(p - m) / (p + m) : 0; });
    o.adx = rma(dx.map((x) => isNaN(x) ? 0 : x), 14);
    const a10 = rma(tr, 10); o.st = new Int8Array(n);
    let fu = Infinity, fl = -Infinity, d = 1;
    for (let i = 0; i < n; i++) {
      const m = (c[i].h + c[i].l) / 2, A = isNaN(a10[i]) ? tr[i] : a10[i], ub = m + 3 * A, lb = m - 3 * A;
      const pc = i ? C[i - 1] : C[0];
      fu = ub < fu || pc > fu ? ub : fu; fl = lb > fl || pc < fl ? lb : fl;
      if (d === 1 && C[i] < fl) d = -1; else if (d === -1 && C[i] > fu) d = 1;
      o.st[i] = d;
    }
    // Bollinger (20, 2): middle band and width
    o.bbMid = sma(C, 20); o.bbW = new Float64Array(n);
    for (let i = 19; i < n; i++) { let v = 0; for (let j = i - 19; j <= i; j++) v += (C[j] - o.bbMid[i]) ** 2; o.bbW[i] = 4 * Math.sqrt(v / 20) / o.bbMid[i]; }
    // VWAP anchored at the highest high / lowest low of the last 200 candles
    const PV = new Float64Array(n + 1), V = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { const w = hasVol ? (c[i].v || 0) : 1; PV[i + 1] = PV[i] + w * (c[i].h + c[i].l + c[i].c) / 3; V[i + 1] = V[i] + w; }
    o.vwH = new Float64Array(n); o.vwL = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let jh = k, jl = k;
      for (let j = Math.max(0, k - 199); j <= k; j++) { if (c[j].h >= c[jh].h) jh = j; if (c[j].l <= c[jl].l) jl = j; }
      const vw = (j) => V[k + 1] - V[j] > 0 ? (PV[k + 1] - PV[j]) / (V[k + 1] - V[j]) : C[k];
      o.vwH[k] = vw(jh); o.vwL[k] = vw(jl);
    }
    // Ichimoku (9, 26, 52): cloud spans, plotted 26 candles ahead
    const mid = (i, p) => (hh(c, i, p, (y) => y.h) + ll(c, i, p, (y) => y.l)) / 2;
    o.spA = new Float64Array(n); o.spB = new Float64Array(n);
    for (let i = 0; i < n; i++) { o.spA[i] = (mid(i, 9) + mid(i, 26)) / 2; o.spB[i] = mid(i, 52); }
    return o;
  }

  // last daily index whose candle had closed by time t
  function dailyIdx(dc, t) { let lo = 0, hi = dc.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (dc[m].t + 86400 <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a; }

  // all six checks for a breakout at the close of candle k in direction dir → { structure: bool, … }
  function checks(X, k, dir) {
    const key = k * 2 + (dir > 0 ? 1 : 0);
    if (X.cache.has(key)) return X.cache.get(key);
    const { c, dc, sec } = X;
    const x = c[k], tClose = x.t + sec, A = X.atr[k];
    const out = {};
    // 1) daily structure
    let ds = 0; for (const e of X.dEv) { if (e.known <= tClose) ds = e.dir; else break; }
    out.structure = X.tf === "1d" ? true : ds === dir;
    // 2) trend rays on this timeframe (window of the last 300 candles)
    try {
      const R = TE.analyze({ [X.tf]: c.slice(Math.max(0, k - 299), k + 1) }).tfs[X.tf];
      const st = (s) => s && (s.status === "Broken" || s.status === "Breaking");
      const against = dir > 0 ? R.downStatus : R.upStatus, withDir = dir > 0 ? R.upStatus : R.downStatus;
      out.rays = (!against || st(against)) && !(withDir && st(withDir));
    } catch (e) { out.rays = false; }
    // 3) liquidity beyond price + no opposing FVG just in front of it
    const beyond = (p) => dir > 0 ? p > x.c : p < x.c;
    let liq = false;
    const sw = X.sw4.filter((w) => w.conf <= k && w.type === (dir > 0 ? "H" : "L") && beyond(w.price)).slice(-60);
    for (let m = sw.length - 1; m >= 0 && !liq; m--) {
      const w = sw[m]; let taken = false;
      for (let j = w.i + 1; j <= k; j++) if (dir > 0 ? c[j].h > w.price : c[j].l < w.price) { taken = true; break; }
      if (!taken) liq = true;
    }
    if (!liq && dc.length) {
      const di = dailyIdx(dc, tClose);
      const swd = X.swD.filter((w) => w.known <= tClose && w.type === (dir > 0 ? "H" : "L") && beyond(w.price)).slice(-40);
      for (let m = swd.length - 1; m >= 0 && !liq; m--) {
        const w = swd[m]; let taken = false;
        for (let j = w.i + 1; j <= di; j++) if (dir > 0 ? dc[j].h > w.price : dc[j].l < w.price) { taken = true; break; }
        if (!taken) for (let j = k; j >= 0 && c[j].t >= (dc[di] ? dc[di].t + 86400 : 0); j--) if (dir > 0 ? c[j].h > w.price : c[j].l < w.price) { taken = true; break; }
        if (!taken) liq = true;
      }
    }
    let block = false;
    for (const g of SMC.fvgs(c.slice(Math.max(0, k - 299), k + 1), 300)) {
      if (dir > 0 && g.dir < 0 && g.bot > x.c && g.bot - x.c <= 1.5 * A) block = true;
      if (dir < 0 && g.dir > 0 && g.top < x.c && x.c - g.top <= 1.5 * A) block = true;
    }
    out.liquidity = liq && !block;
    // 4) volume above the 20-candle average
    if (!X.hasVol) out.volume = true;
    else { let s = 0; for (let j = k - 20; j < k; j++) s += X.vol[j]; out.volume = X.vol[k] > s / 20; }
    // 5) not in premium (longs) / discount (shorts) of the last 60 days
    {
      const di = dailyIdx(dc, tClose);
      let hi = -Infinity, lo = Infinity;
      for (let j = Math.max(0, di - 59); j <= di; j++) { hi = Math.max(hi, dc[j].h); lo = Math.min(lo, dc[j].l); }
      for (let j = k; j >= 0 && c[j].t >= (dc[di] ? dc[di].t + 86400 : Infinity); j--) { hi = Math.max(hi, c[j].h); lo = Math.min(lo, c[j].l); }
      if (!(hi > lo)) out.fib = true;
      else { const pos = (x.c - lo) / (hi - lo); out.fib = dir > 0 ? pos <= 0.79 : pos >= 0.21; out.fibPos = pos; }
    }
    // 6) oscillators summary
    out.osc = dir > 0 ? X.osc[k] > 0.1 : X.osc[k] < -0.1;
    out.oscRating = X.osc[k];
    // 7–16) extra indicators
    {
      const di = dailyIdx(dc, tClose);
      const dAv = (A) => di < 0 || !(A[di] > 0) ? true : dir > 0 ? dc[di].c > A[di] : dc[di].c < A[di];
      out.above50 = dAv(X.dS50); out.above200 = dAv(X.dS200);
    }
    out.ema = dir > 0 ? X.e20[k] > X.e50[k] : X.e20[k] < X.e50[k];
    out.supertrend = X.st[k] === dir;
    out.adx = X.adx[k] > 20;
    out.rsi = dir > 0 ? X.rsi[k] > 50 : X.rsi[k] < 50;
    out.macd = dir > 0 ? X.macd[k] > X.sig[k] : X.macd[k] < X.sig[k];
    out.vwap = dir > 0 ? x.c > X.vwH[k] : x.c < X.vwL[k];
    out.bb = k >= 25 && (dir > 0 ? x.c > X.bbMid[k] : x.c < X.bbMid[k]) && X.bbW[k] > X.bbW[k - 5];
    out.ichimoku = k >= 78 && (dir > 0 ? x.c > Math.max(X.spA[k - 26], X.spB[k - 26]) : x.c < Math.min(X.spA[k - 26], X.spB[k - 26]));
    X.cache.set(key, out);
    return out;
  }
  const maskOf = (ck) => KEYS.reduce((m, f, b) => m | (ck[f] ? 1 << b : 0), 0);

  // the Donchian system; `need` = bit mask of filters that must pass to take a signal
  function runDonchian(X, opts, need) {
    const { c, sec } = X;
    const fee = (opts.feePct == null ? 0.05 : opts.feePct) / 100, funding = (opts.fundingPct == null ? 0.01 : opts.fundingPct) / 100;
    const sides = opts.sides || "long", startT = opts.startT || c[0].t, warm = 210;
    const trades = [];
    let pos = null, pending = null;
    const close = (k, price, how) => {
      const hours = (c[k].t - c[pos.entryIdx].t) / 3600 + sec / 3600;
      const cost = fee * (pos.entry + price) + funding * (hours / 8) * pos.entry;
      trades.push({ dir: pos.dir, t: c[pos.entryIdx].t, exitT: c[k].t, entry: pos.entry, stop0: pos.stop0, exit: price, how, r: pos.dir * (price - pos.entry) / pos.risk - cost / pos.risk, bars: k - pos.entryIdx + 1, mask: pos.mask });
      pos = null;
    };
    for (let k = 1; k < c.length; k++) {
      const x = c[k];
      if (pending && !pos) {
        if (pending.dir > 0 ? x.o > pending.stop : x.o < pending.stop) pos = { dir: pending.dir, entry: x.o, entryIdx: k, stop: pending.stop, stop0: pending.stop, risk: Math.abs(x.o - pending.stop), mask: pending.mask };
        pending = null;
      }
      if (pos) {
        if (pos.dir > 0 && x.l <= pos.stop) close(k, Math.min(x.o, pos.stop), "stop");
        else if (pos.dir < 0 && x.h >= pos.stop) close(k, Math.max(x.o, pos.stop), "stop");
      }
      if (k < warm || x.t < startT || k === c.length - 1) continue;
      const A = X.atr[k];
      if (pos) {
        pos.stop = pos.dir > 0 ? Math.max(pos.stop, X.lo10[k]) : Math.min(pos.stop, X.hi10[k]);
        continue;
      }
      const hi = X.hi20[k], lo = X.lo20[k];
      for (const dir of sides === "both" ? [1, -1] : [1]) {
        if (dir > 0 ? !(x.c > hi) : !(x.c < lo)) continue;
        const mask = maskOf(checks(X, k, dir));
        if ((mask & need) !== need) continue;
        pending = { dir, stop: dir > 0 ? x.c - 2 * A : x.c + 2 * A, mask };
        break;
      }
    }
    if (pos) close(c.length - 1, c[c.length - 1].c, "open");
    return trades;
  }

  // "filters only": no Donchian breakout. Enter when every switched-on filter agrees on a closed
  // candle after not all agreeing on the candle before (fill next open). Stop 2×ATR(20).
  // exit "trail": trail the stop to the 10-candle low (the tested exit)
  // exit "filters": leave at the next open once the switched-on filters stop agreeing (2×ATR stop stays)
  function masks(X, sides) {
    if (X.masks && X.masks.sides === sides) return X.masks;
    const n = X.c.length, L = new Int32Array(n), S = new Int32Array(n);
    for (let k = 30; k < n; k++) { L[k] = maskOf(checks(X, k, 1)); if (sides === "both") S[k] = maskOf(checks(X, k, -1)); }
    return (X.masks = { L, S, sides });
  }
  function runFiltersOnly(X, opts, need, exit) {
    const { c, sec } = X;
    if (!need) return [];
    const fee = (opts.feePct == null ? 0.05 : opts.feePct) / 100, funding = (opts.fundingPct == null ? 0.01 : opts.fundingPct) / 100;
    const sides = opts.sides || "long", startT = opts.startT || c[0].t, warm = 210;
    const M = masks(X, sides);
    const ok = (k, dir) => ((dir > 0 ? M.L[k] : M.S[k]) & need) === need;
    const trades = [];
    let pos = null, pending = null, exitNext = false;
    const close = (k, price, how) => {
      const hours = (c[k].t - c[pos.entryIdx].t) / 3600 + sec / 3600;
      const cost = fee * (pos.entry + price) + funding * (hours / 8) * pos.entry;
      trades.push({ dir: pos.dir, t: c[pos.entryIdx].t, exitT: c[k].t, entry: pos.entry, stop0: pos.stop0, exit: price, how, r: pos.dir * (price - pos.entry) / pos.risk - cost / pos.risk, bars: k - pos.entryIdx + 1 });
      pos = null;
    };
    for (let k = 1; k < c.length; k++) {
      const x = c[k];
      if (pending && !pos) {
        if (pending.dir > 0 ? x.o > pending.stop : x.o < pending.stop) pos = { dir: pending.dir, entry: x.o, entryIdx: k, stop: pending.stop, stop0: pending.stop, risk: Math.abs(x.o - pending.stop) };
        pending = null;
      }
      if (pos && exitNext) { close(k, x.o, "filters"); exitNext = false; }
      if (pos) {
        if (pos.dir > 0 && x.l <= pos.stop) close(k, Math.min(x.o, pos.stop), "stop");
        else if (pos.dir < 0 && x.h >= pos.stop) close(k, Math.max(x.o, pos.stop), "stop");
      }
      if (k < warm || x.t < startT || k === c.length - 1) continue;
      const A = X.atr[k];
      if (pos) {
        if (exit === "filters") { if (!ok(k, pos.dir)) exitNext = true; }
        else {
          pos.stop = pos.dir > 0 ? Math.max(pos.stop, X.lo10[k]) : Math.min(pos.stop, X.hi10[k]);
        }
        continue;
      }
      for (const dir of sides === "both" ? [1, -1] : [1]) {
        if (!ok(k, dir) || ok(k - 1, dir)) continue;
        pending = { dir, stop: dir > 0 ? x.c - 2 * A : x.c + 2 * A };
        break;
      }
    }
    if (pos) close(c.length - 1, c[c.length - 1].c, "open");
    return trades;
  }

  // live replay of the filters-only system (trailing-stop exit) for the Telegram alerts.
  // need = filters that must all agree to signal; plus = extra filters that make it an A+ setup.
  // Same rules as runFiltersOnly(…, "trail"), plus the events the alerts need.
  function replayFilters(X, opts = {}) {
    const { c } = X;
    const need = opts.need, plus = opts.plus || 0, sides = opts.sides || "long", warm = opts.warm == null ? 210 : opts.warm;
    const M = masks(X, sides);
    const mk = (k, dir) => dir > 0 ? M.L[k] : M.S[k];
    const ok = (k, dir) => (mk(k, dir) & need) === need;
    const events = [], trades = [];
    let pos = null, pending = null;
    const closePos = (k, price, how) => {
      const r = pos.dir * (price - pos.entry) / pos.risk;
      trades.push({ dir: pos.dir, t: c[pos.entryIdx].t, exitT: c[k].t, entry: pos.entry, stop0: pos.stop0, exit: price, how, r, aplus: pos.aplus });
      events.push({ k, t: c[k].t, type: "exit", dir: pos.dir, price, entry: pos.entry, r, how, aplus: pos.aplus });
      pos = null;
    };
    for (let k = 1; k < c.length; k++) {
      const x = c[k];
      if (pending && !pos) {
        if (pending.dir > 0 ? x.o > pending.stop : x.o < pending.stop) {
          pos = { dir: pending.dir, entry: x.o, entryIdx: k, stop: pending.stop, stop0: pending.stop, risk: Math.abs(x.o - pending.stop), aplus: pending.aplus };
          events.push({ k, t: x.t, type: "filled", dir: pos.dir, price: x.o, stop: pos.stop });
        } else events.push({ k, t: x.t, type: "skipped", dir: pending.dir, price: x.o, stop: pending.stop });
        pending = null;
      }
      if (pos) {
        if (pos.dir > 0 && x.l <= pos.stop) closePos(k, Math.min(x.o, pos.stop), "stop");
        else if (pos.dir < 0 && x.h >= pos.stop) closePos(k, Math.max(x.o, pos.stop), "stop");
      }
      if (k < warm) continue;
      const A = X.atr[k];
      if (pos) {
        let lo = Infinity, hi = -Infinity;
        for (let m = k - 9; m <= k; m++) { lo = Math.min(lo, c[m].l); hi = Math.max(hi, c[m].h); }
        const next = pos.dir > 0 ? Math.max(pos.stop, lo) : Math.min(pos.stop, hi);
        if (next !== pos.stop) { events.push({ k, t: x.t, type: "stop", dir: pos.dir, from: pos.stop, stop: next, price: x.c }); pos.stop = next; }
        continue;
      }
      for (const dir of sides === "both" ? [1, -1] : [1]) {
        if (!ok(k, dir) || ok(k - 1, dir)) continue;
        if (opts.allow && !opts.allow(k, dir)) continue;          // e.g. only above the 200-day average
        const ck = checks(X, k, dir);
        const aplus = plus ? (mk(k, dir) & plus) === plus : false;
        pending = { dir, stop: dir > 0 ? x.c - 2 * A : x.c + 2 * A, aplus };
        events.push({ k, t: x.t, type: "signal", dir, price: x.c, stop: pending.stop, atr: A, checks: ck, aplus });
        break;
      }
    }
    const k = c.length - 1;
    return {
      events, trades, pending, last: c[k], atr: X.atr[k],
      position: pos ? { dir: pos.dir, entry: pos.entry, entryT: c[pos.entryIdx].t, stop: pos.stop, stop0: pos.stop0, risk: pos.risk, aplus: pos.aplus, openR: pos.dir * (c[k].c - pos.entry) / pos.risk } : null,
      now: checks(X, k, 1),
    };
  }

  function summarize(trades, riskPct) {
    const n = trades.length;
    if (!n) return { n: 0 };
    let wins = 0, sum = 0, gp = 0, gl = 0, eq = 100, peak = 100, dd = 0;
    for (const t of trades) { sum += t.r; if (t.r > 0) { wins++; gp += t.r; } else gl -= t.r; }
    for (const t of [...trades].sort((a, b) => a.exitT - b.exitT)) { eq *= 1 + riskPct / 100 * t.r; peak = Math.max(peak, eq); dd = Math.max(dd, (peak - eq) / peak * 100); }
    return { n, winRate: wins / n, avgR: sum / n, totalR: sum, pf: gl ? gp / gl : 99, ret: eq - 100, dd };
  }

  // every combination of up to 4 switches (2,516 with 16 filters); keeps the 1- and 2-filter results,
  // the top 5 per mode, and can evaluate any other combination on demand (evalMask)
  const bits = (m) => { let b = 0; while (m) { b += m & 1; m >>>= 1; } return b; };
  function study(data, opts = {}) {
    const tf = opts.tf || "4h";
    if (!data[tf] || data[tf].length < 260) throw new Error("not enough candles for " + tf);
    const X = context(data, tf), risk = opts.risk || 1, maxOn = opts.maxOn || 4, minN = opts.minN || 60;
    const evalMask = (m) => ({
      c: summarize(runDonchian(X, opts, m), risk),
      trail: m ? summarize(runFiltersOnly(X, opts, m, "trail"), risk) : { n: 0 },
      filters: m ? summarize(runFiltersOnly(X, opts, m, "filters"), risk) : { n: 0 },
    });
    const base = runDonchian(X, opts, 0);
    const combos = { 0: summarize(base, risk) }, only = { trail: { 0: { n: 0 } }, filters: { 0: { n: 0 } } };
    const top = { c: [], trail: [], filters: [] };
    const push = (list, m, st) => { if (st.n < minN) return; list.push([m, st]); list.sort((p, q) => q[1].avgR - p[1].avgR); if (list.length > 5) list.pop(); };
    const store = (m, e) => { combos[m] = e.c; only.trail[m] = e.trail; only.filters[m] = e.filters; };
    let tested = 0;
    for (let m = 1; m < 1 << KEYS.length; m++) {
      const nb = bits(m);
      if (nb > maxOn) continue;
      const e = evalMask(m); tested++;
      if (nb <= 2) store(m, e);
      push(top.c, m, e.c); push(top.trail, m, e.trail); push(top.filters, m, e.filters);
    }
    for (const m of opts.extra || []) if (combos[m] == null) store(m, evalMask(m));
    for (const k of ["c", "trail", "filters"]) for (const [m, st] of top[k]) if (combos[m] == null) store(m, evalMask(m));
    // pass rate of each filter among the plain Donchian signals
    const pass = KEYS.map((f, b) => { const n = base.length; return n ? base.filter((t) => t.mask & (1 << b)).length / n : 0; });
    // share of candles on which each filter agrees (long)
    const M = masks(X, opts.sides || "long"), from = Math.max(210, X.c.findIndex((x) => x.t >= (opts.startT || 0)));
    const on = KEYS.map((f, b) => { let a = 0, n = 0; for (let k = from; k < X.c.length; k++) { n++; if (M.L[k] & (1 << b)) a++; } return n ? a / n : 0; });
    return { combos, pass, base, hasVol: X.hasVol, ctx: X, only, on, top, tested, evalMask };
  }

  const api = { FILTERS, KEYS, study, checks, context, runDonchian, runFiltersOnly, replayFilters, masks, oscRating, oscLabel, summarize, maskOf, TF_SEC };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DonchianFilters = api;
})(typeof window !== "undefined" ? window : globalThis);
