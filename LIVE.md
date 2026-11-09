# YouTube live with Addis-Trading Signals

**Live mode** is a full-screen 1920×1080 broadcast view of the app:

- the chart with all drawings (trend rays, BOS/CHoCH, swing labels, order blocks, HTF liquidity, FVG, Fib, volume), zoomed to about the last 70 candles — a different timeframe each minute of a symbol's turn: **4H → 1H → 30m → 15m → 5m**
- **DXY · U.S. Dollar Index** (TradingView, 1H candles, last 5 days) top-left for reference
- the **addis-4H** panel: status (waiting / 🟢 BUY / ⭐ A+ / in a long), the ✅/❌ checks and the stop
- a chart-analysis summary (bias, 4H structure, trend rays, nearest liquidity)
- a scrolling **ANALYSIS** marquee at the bottom, refreshed every minute, with the watchlist and "Not financial advice"
- a bold **⚠ NOT FINANCIAL ADVICE** box in the top bar
- a **live scorecard**: every addis-4H trade on the rotation symbols since 6 Nov 2026 (trades, wins, total R after fees and funding, open R, per symbol, and ⭐ A+ trades separately)
- a **market-session clock**: Tokyo, London and New York with their hours in EAT, open/closed, time left, and the London + New York overlap
- a **Telegram** tag in the bottom-right corner (and in the marquee): *📲 Free alerts on Telegram: @addistrad*
- **music that follows the trend** (bullish / bearish / sideways) — see *Music* below
- a new symbol every **5 minutes**, with a countdown in the top-right corner
- a **signal banner** (🔔 BUY SIGNAL or ⭐ A+ BUY SETUP) that drops in for 60 seconds when any symbol in the rotation gets a new signal; the chart jumps to that symbol. All symbols are checked every 5 minutes.

## The link

`https://addiserp.github.io/signal-dashboard/?live=1`  (needs GitHub Pages on: Settings → Pages → Branch `main`, folder `/docs`)

or the downloaded file: `file:///C:/path/to/Addis-Trading-Signals.html?live=1`

Options, added to the link with `&`:

| Option | Example | Meaning |
| --- | --- | --- |
| `syms` | `&syms=BTCUSDT,XAUUSDT,NVDAUSDT,SPCXUSDT,NEARUSDT` | symbols to rotate (the default list; any Binance USDT-M symbol works, e.g. METAUSDT, TSLAUSDT) |
| `rotate` | `&rotate=5` | minutes per symbol (the timeframes share this time equally) |
| `tfs` | `&tfs=4h,1h,30m,15m,5m` | timeframes shown during each symbol's turn, in order |
| `dxy` | `&dxy=CAPITALCOM:DXY` | the dollar-index symbol for the TradingView chart (default `CAPITALCOM:DXY`; TradingView doesn't allow `TVC:DXY` in embedded charts) |
| `tg` | `&tg=addistrad` | the Telegram name shown on screen |
| `since` | `&since=2026-11-06` | start date of the live scorecard |
| `music` | `&music=0` | turn the music off |
| `vol` | `&vol=0.25` | music volume, 0 to 1 |
| `shuffle` | `&shuffle=all` | ignore the trend and shuffle every track of all moods together |
| `musicdir` | `&musicdir=music` | folder with the music files, next to the page |
| `reload` | `&reload=4` | refresh the page every N hours (keeps long streams light; `0` = never) |
| `test=banner` | `&test=banner` | shows a sample A+ banner after 5 seconds — to check the layout in OBS |

Opening Live mode does not change your normal app settings.

## Music (YouTube Audio Library)

The page plays music that matches the current symbol's top-down trend: **bullish** when the trend is up, **bearish** when it is down, **neutral** when it is sideways. A mood change waits until the current track ends, so the music never cuts off suddenly.

1. **YouTube Studio → Audio library** (left menu). Filter: **Attribution not required** (so you don't have to credit anyone).
2. Pick tracks by **Mood**: *Bright / Happy / Inspirational* for bullish, *Dark / Dramatic* for bearish, *Calm* for neutral. Genres like Ambient, Cinematic or Electronic work well behind a chart. Download about 3–5 of each.
3. Make a folder called **`music`** next to the page file and rename the downloads exactly like this:
   `bullish-1.mp3`, `bullish-2.mp3`, … · `bearish-1.mp3`, `bearish-2.mp3`, … · `neutral-1.mp3`, `neutral-2.mp3`, …
   (numbers 1 to 60; gaps are fine). The page **shuffles** each mood: every track plays once in random order before any repeats, then it reshuffles. New files are picked up every 30 minutes (or refresh the source).
4. Use the downloaded page file in OBS (Browser source → the `file:///…/Addis-Trading-Signals.html?live=1` link) so it finds the `music` folder. Don't upload the music to the public GitHub repository.
5. In OBS, tick **Control audio via OBS** on the browser source, and set its volume in the OBS audio mixer. In a normal browser, click once on the page to start the music (browsers block autoplay with sound).

The session box shows which mood and track is playing. If no files are found, the page simply stays silent.

## OBS Studio → YouTube (one time, ~10 minutes)

1. Install **OBS Studio** (free, obsproject.com).
2. **Settings → Video**: Base and Output resolution **1920×1080**, 30 FPS. **Settings → Output**: video bitrate about 4500–6000 kbps.
3. In **Sources** click **+ → Browser**: URL = the link above, Width **1920**, Height **1080**. Tick *Refresh browser when scene becomes active*.
4. **YouTube Studio → Create → Go live → Stream**: copy the **stream key**. In OBS **Settings → Stream**: Service *YouTube – RTMPS*, paste the key.
5. Press **Start streaming**, then check the preview in YouTube Studio.

**Long streams:** YouTube may not save a replay of a stream longer than 12 hours, so for 24/7 streaming stop and start a new stream about every 11 hours. The page refreshes itself every 4 hours so it doesn't slowly fill the memory. In OBS turn on **Settings → Advanced → Automatically reconnect**.

Add your webcam, voice or logo in OBS on top of the browser source if you like. Keep the PC awake (power settings: never sleep) for long streams. If the page ever looks stuck, right-click the browser source → **Refresh**.

Not financial advice — keep it visible on the stream (the marquee always shows it).
