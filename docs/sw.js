// Service worker: keeps the app shell available, never caches market data
const CACHE = "signals-v8";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png",
  "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
];

self.addEventListener("install", (e) => {
  // local files must cache; the chart library is cached if reachable (and again on first use)
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) =>
    u.startsWith("http") ? c.add(u).catch(() => {}) : c.add(u)
  ))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // live data and TradingView widgets always go to the network
  if (/binance|tradingview/.test(url.hostname)) return;
  // the page itself: network first so updates arrive, cache when offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", cp)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // icons, manifest, chart library: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
