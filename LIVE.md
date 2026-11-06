# YouTube live with Addis-Trading Signals

**Live mode** is a full-screen 1920×1080 broadcast view of the app:

- the chart with all drawings (trend rays, BOS/CHoCH, swing labels, order blocks, HTF liquidity, FVG, Fib, volume), zoomed to about the last 70 candles — a different timeframe each minute of a symbol's turn: **4H → 1H → 30m → 15m → 5m**
- **DXY · U.S. Dollar Index** (TradingView, 1H candles, last 5 days) top-left for reference
- the **addis-4H** panel: status (waiting / 🟢 BUY / ⭐ A+ / in a long), the ✅/❌ checks and the stop
- a chart-analysis summary (bias, 4H structure, trend rays, nearest liquidity)
- a scrolling **ANALYSIS** marquee at the bottom, refreshed every minute, with the watchlist and "Not financial advice"
- a new symbol every **5 minutes**, with a countdown in the top-right corner
- a **signal banner** (🔔 BUY SIGNAL or ⭐ A+ BUY SETUP) that drops in for 60 seconds when any symbol in the rotation gets a new signal; the chart jumps to that symbol. All symbols are checked every 5 minutes.

## The link

`https://addiserp.github.io/signal-dashboard/?live=1`  (needs GitHub Pages on: Settings → Pages → Branch `main`, folder `/docs`)

or the downloaded file: `file:///C:/path/to/Addis-Trading-Signals.html?live=1`

Options, added to the link with `&`:

| Option | Example | Meaning |
| --- | --- | --- |
| `syms` | `&syms=BTCUSDT,ETHUSDT,ZECUSDT,XAUUSDT,CLUSDT` | symbols to rotate (the default list) |
| `rotate` | `&rotate=5` | minutes per symbol (the timeframes share this time equally) |
| `tfs` | `&tfs=4h,1h,30m,15m,5m` | timeframes shown during each symbol's turn, in order |
| `dxy` | `&dxy=CAPITALCOM:DXY` | the dollar-index symbol for the TradingView chart (default `CAPITALCOM:DXY`; TradingView doesn't allow `TVC:DXY` in embedded charts) |
| `test=banner` | `&test=banner` | shows a sample A+ banner after 5 seconds — to check the layout in OBS |

Opening Live mode does not change your normal app settings.

## OBS Studio → YouTube (one time, ~10 minutes)

1. Install **OBS Studio** (free, obsproject.com).
2. **Settings → Video**: Base and Output resolution **1920×1080**, 30 FPS. **Settings → Output**: video bitrate about 4500–6000 kbps.
3. In **Sources** click **+ → Browser**: URL = the link above, Width **1920**, Height **1080**. Tick *Refresh browser when scene becomes active*.
4. **YouTube Studio → Create → Go live → Stream**: copy the **stream key**. In OBS **Settings → Stream**: Service *YouTube – RTMPS*, paste the key.
5. Press **Start streaming**, then check the preview in YouTube Studio.

Add your webcam, voice or logo in OBS on top of the browser source if you like. Keep the PC awake (power settings: never sleep) for long streams. If the page ever looks stuck, right-click the browser source → **Refresh**.

Not financial advice — keep it visible on the stream (the marquee always shows it).
