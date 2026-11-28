// which stock-data sources answer from a GitHub runner?
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9" };
async function tryUrl(name, url, h = {}) {
  try { const r = await fetch(url, { headers: { ...UA, ...h } }); const t = await r.text(); console.log(`${name}: HTTP ${r.status} · ${t.length} bytes · ${t.slice(0, 140).replace(/\s+/g, " ")}`); return { r, t }; }
  catch (e) { console.log(`${name}: ${e.message}`); return null; }
}
await tryUrl("yahoo q1 1h", "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=60m&range=730d");
await new Promise((r) => setTimeout(r, 3000));
await tryUrl("yahoo q2 1d", "https://query2.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=10y");
// cookie + crumb route
const c = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" }).catch(() => null);
const cookie = c && (c.headers.get("set-cookie") || "").split(";")[0];
console.log("yahoo cookie:", cookie ? cookie.slice(0, 20) + "…" : "none");
if (cookie) {
  const cr = await tryUrl("yahoo crumb", "https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie });
  if (cr && cr.r.ok) await tryUrl("yahoo crumb 1h", `https://query2.finance.yahoo.com/v8/finance/chart/NVDA?interval=60m&range=730d&crumb=${encodeURIComponent(cr.t)}`, { Cookie: cookie });
}
await tryUrl("stooq 1d", "https://stooq.com/q/d/l/?s=nvda.us&i=d");
await tryUrl("stooq 1h", "https://stooq.com/q/d/l/?s=nvda.us&i=60");
await tryUrl("nasdaq hist", "https://api.nasdaq.com/api/quote/NVDA/historical?assetclass=stocks&fromdate=2015-01-01&limit=10&todate=2026-11-27");
await tryUrl("binance fapi", "https://fapi.binance.com/fapi/v1/klines?symbol=NVDAUSDT&interval=4h&limit=5");
await tryUrl("binance vision futures", "https://data.binance.vision/?prefix=data/futures/um/monthly/klines/NVDAUSDT/4h/");
await tryUrl("binance vision zip", "https://data.binance.vision/data/futures/um/monthly/klines/NVDAUSDT/1h/NVDAUSDT-1h-2026-10.zip");
