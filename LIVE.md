# YouTube live with Addis 4H

**Live mode** is a full-screen 1920×1080 broadcast view of the app:

- the chart with all drawings (trend rays, BOS/CHoCH, swing labels, order blocks, HTF liquidity, FVG, Fib, volume), zoomed to about the last 70 candles — a different timeframe each minute of a symbol's turn: **4H → 1H → 30m → 15m → 5m**
- **DXY · U.S. Dollar Index** (TradingView, 1H candles, last 5 days) top-left for reference
- the **addis-4H Signals** panel: status (waiting / 🟢 BUY / ⭐ A+ / in a long), the ✅/❌ checks and the stop
- a chart-analysis summary (bias, 4H structure, trend rays, nearest liquidity)
- a scrolling **ANALYSIS** marquee at the bottom, refreshed every minute, with the watchlist and "Not financial advice"
- a bold **⚠ NOT FINANCIAL ADVICE** box in the top bar
- a **live scorecard**: every addis-4H Signals trade on the rotation symbols since 6 Nov 2026 (trades, wins, total R after fees and funding, open R, per symbol, and ⭐ A+ trades separately)
- **VIX · fear index** (TradingView, 1H candles, last 5 days) under DXY
- a **market phase** box: for every rotation symbol, Uptrend / Pullback / Correction / Deep correction / Bear market (drop from the 180-day high, scaled by the asset's own volatility, and the 200-day average), the Binance funding rate and the 24h open-interest change
- a **subscribe + bell reminder** each time the coin changes: a cursor clicks SUBSCRIBE, then the bell rings (with a short click and bell sound)
- on the chart: **Bollinger Bands (20, 2)** and a **VWAP anchored at the highest high** of the last 200 candles (price back above it often marks the end of a pullback)
- **music that follows the trend** (bullish / bearish / sideways) — see *Music* below
- a new symbol every **5 minutes**, with a countdown in the top-right corner
- a **signal banner** (🔔 BUY SIGNAL or ⭐ A+ BUY SETUP) that drops in for 60 seconds when any symbol in the rotation gets a new signal; the chart jumps to that symbol. All symbols are checked every 5 minutes.

## The link

`https://addiserp.github.io/signal-dashboard/?live=1`  (needs GitHub Pages on: Settings → Pages → Branch `main`, folder `/docs`)

or the downloaded file: `file:///C:/path/to/Addis-4H.html?live=1`

Options, added to the link with `&`:

| Option | Example | Meaning |
| --- | --- | --- |
| `syms` | `&syms=BTCUSDT,XAUUSDT,NVDAUSDT,SPCXUSDT,NEARUSDT` | symbols to rotate (the default list; any Binance USDT-M symbol works, e.g. METAUSDT, TSLAUSDT) |
| `rotate` | `&rotate=5` | minutes per symbol (the timeframes share this time equally) |
| `tfs` | `&tfs=4h,1h,30m,15m,5m` | timeframes shown during each symbol's turn, in order |
| `dxy` | `&dxy=CAPITALCOM:DXY` | the dollar-index symbol for the TradingView chart (default `CAPITALCOM:DXY`; TradingView doesn't allow `TVC:DXY` in embedded charts) |
| `lang` | `&lang=am`, `&lang=ar` or `&lang=om` | on-screen language: **Amharic** (Ethiopic script), **Arabic** (right to left) or **Afaan Oromo** (Qubee). Leave it out for English. Chart labels (BOS, CHoCH, OB, Fibonacci, BSL/SSL) and symbols stay in English, as traders use them. For one stream per language, add a second Browser source (or a second OBS profile) with the other `lang` and its own YouTube stream key |
| `lang=auto` | `&lang=auto` | **one stream, four languages by the clock.** The page switches language at fixed times (Addis Ababa time, EAT). Default: **English 16:00–06:00** (New York session and the US evening), **Arabic 06:00–09:20**, **Amharic 09:20–12:40**, **Afaan Oromo 12:40–16:00**. The countdown line shows the next language and the time it starts, and the news ticker shows the whole timetable, so viewers know when to tune in. It never switches while a signal banner is showing |
| `sched` | `&sched=06:00=ar,09:20=am,12:40=om,16:00=en` | your own timetable for `lang=auto`: start times in EAT (24 h) with a language (`en` `am` `ar` `om`). Each language runs until the next start time |
| `sub` | `&sub=0` | turn off the subscribe + bell reminder that pops up (bottom-right, about 6 seconds) each time the coin changes |
| `subsnd` | `&subsnd=0` | keep the reminder but without its click and bell sound (`&subvol=0.35` sets its volume) |
| `vix` | `&vix=CAPITALCOM:VIX` | the VIX symbol for the chart under DXY (default `CAPITALCOM:VIX`) |
| `since` | `&since=2026-11-06` | start date of the live scorecard |
| `music` | `&music=0` | turn the music off |
| `vol` | `&vol=0.25` | music volume, 0 to 1 |
| `shuffle` | `&shuffle=all` | ignore the trend and shuffle every track of all moods together |
| `musicdir` | `&musicdir=music` | folder with the music files, next to the page |
| `reload` | `&reload=4` | refresh the page every N hours (keeps long streams light; `0` = never) |
| `req` | `&req=5` | minutes a viewer request is shown |
| `test=banner` | `&test=banner` | shows a sample A+ banner after 5 seconds — to check the layout in OBS |

Opening Live mode does not change your normal app settings.

## Viewer requests (show any coin or stock on demand)

When someone in the chat asks for a coin, show it without leaving Live mode:

1. In OBS, right-click the Live **Browser** source → **Interact**. A small window opens; click inside it once.
2. Press **/** (or **R**). A box appears: type the name and press **Enter** — e.g. `SOL`, `ETH`, `GOLD`, `SILVER`, `OIL`, `NVDA`, `TSLA`, `META`, or any Binance symbol (`DOGEUSDT`). Add the viewer's name to credit them: `SOL @abebe`.
3. The coin is shown with all drawings for 5 minutes (4H → 1H → 30m → 15m → 5m), a purple **🙋 Request · @name** label in the top bar, and a line in the marquee. Then the stream goes back to the normal rotation.
4. Type more names while one is showing to **queue** them; they play one after another. **Esc** closes the box.

Unknown names show "not found on Binance" in the box. Signal banners don't interrupt a request. Option: `&req=3` makes requests 3 minutes long.

## Music (YouTube Audio Library)

The page plays music that matches the current symbol's top-down trend: **bullish** when the trend is up, **bearish** when it is down, **neutral** when it is sideways. A mood change waits until the current track ends, so the music never cuts off suddenly.

1. **YouTube Studio → Audio library** (left menu). Filter: **Attribution not required** (so you don't have to credit anyone).
2. Pick tracks by **Mood**: *Bright / Happy / Inspirational* for bullish, *Dark / Dramatic* for bearish, *Calm* for neutral. Genres like Ambient, Cinematic or Electronic work well behind a chart. Download about 3–5 of each.
3. Make a folder called **`music`** next to the page file and rename the downloads exactly like this:
   `bullish-1.mp3`, `bullish-2.mp3`, … · `bearish-1.mp3`, `bearish-2.mp3`, … · `neutral-1.mp3`, `neutral-2.mp3`, …
   (numbers 1 to 60; gaps are fine). The page **shuffles** each mood: every track plays once in random order before any repeats, then it reshuffles. New files are picked up every 30 minutes (or refresh the source).
4. Use the downloaded page file in OBS (Browser source → the `file:///…/Addis-4H.html?live=1` link) so it finds the `music` folder. Don't upload the music to the public GitHub repository.
5. In OBS, tick **Control audio via OBS** on the browser source, and set its volume in the OBS audio mixer. In a normal browser, click once on the page to start the music (browsers block autoplay with sound).

If no files are found, the page simply stays silent.

## OBS Studio → YouTube (one time, ~10 minutes)

1. Install **OBS Studio** (free, obsproject.com).
2. **Settings → Video**: Base and Output resolution **1920×1080**, 30 FPS. **Settings → Output**: video bitrate about 4500–6000 kbps.
3. In **Sources** click **+ → Browser**: URL = the link above, Width **1920**, Height **1080**. Tick *Refresh browser when scene becomes active*.
4. **YouTube Studio → Create → Go live → Stream**: copy the **stream key**. In OBS **Settings → Stream**: Service *YouTube – RTMPS*, paste the key.
5. In the same stream key's settings turn on **Auto-start** and **Auto-stop**. Then YouTube goes live again on its own whenever OBS reconnects, which the watchdog (step 8) relies on.
6. Press **Start streaming**, then check the preview in YouTube Studio.
7. **Four languages on one stream:** add `&lang=auto` to the Browser-source URL, e.g. `https://addiserp.github.io/signal-dashboard/?live=1&lang=auto`. The page switches language by the clock (EAT): English 16:00–06:00, Arabic 06:00–09:20, Amharic 09:20–12:40, Afaan Oromo 12:40–16:00. Change the times with `&sched=` (see the options table). Then paste the timetable below into the stream's **description** (YouTube Studio → the stream → *Edit* → *Description*). If you change `&sched=`, change the times in the description too.
8. **Watchdog:** start `watchdog/obs_watchdog.py` (setup in `watchdog/README.md`). It restarts the stream, or OBS itself, when OBS stops or YouTube stops showing the stream as live.

### Description: language timetable (copy into YouTube)

Also saved as `youtube-schedule.txt`. YouTube does not allow `<` or `>` in descriptions, and this text has none.

```
🌐 LIVE IN 4 LANGUAGES · ONE STREAM, 24 HOURS
The same live chart and addis-4H Signals, explained in a different language at fixed times every day.
Times are Addis Ababa time (EAT, UTC+3).

🇬🇧 English ········ 16:00 – 06:00 EAT · New York session and the US evening
     (13:00 – 03:00 UTC · 08:00 – 22:00 New York, winter time)
🇸🇦 العربية ········ 06:00 – 09:20 EAT
     بتوقيت مكة المكرمة 06:00 – 09:20 · دبي 07:00 – 10:20 · القاهرة 05:00 – 08:20
🇪🇹 አማርኛ ········ 09:20 – 12:40 EAT
     በኢትዮጵያ ሰዓት ከጠዋቱ 3:20 – ቀን 6:40
🇪🇹 Afaan Oromoo ··· 12:40 – 16:00 EAT
     Sa'aatii Itoophiyaatiin 6:40 – 10:00 guyyaa

⏰ Set a reminder for your language: the countdown on the stream always shows the next language and the time it starts, and the news ticker shows the whole timetable.

🔔 Subscribe and tap the bell so you don't miss a signal.
📲 Telegram: t.me/addistrad

⚠ Charts never lie, but this is not financial advice. Do your own research. Trading involves risk.
```

**Long streams:** YouTube may not save a replay of a stream longer than 12 hours, so for 24/7 streaming stop and start a new stream about every 11 hours. With Auto-start on and the watchdog running, a quick *Stop streaming* is enough: the watchdog starts the stream again within about 3 minutes and YouTube opens a new broadcast. If you want to stay offline, stop the watchdog first. The page refreshes itself every 4 hours so it doesn't slowly fill the memory. In OBS turn on **Settings → Advanced → Automatically reconnect**.

Add your webcam, voice or logo in OBS on top of the browser source if you like. Keep the PC awake (power settings: never sleep) for long streams. If the page ever looks stuck, right-click the browser source → **Refresh**.

Not financial advice — keep it visible on the stream (the marquee always shows it).
