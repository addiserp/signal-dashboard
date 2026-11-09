# 4H filter alerts on Telegram

Every 15 minutes (after step 5 below), GitHub checks the latest **closed 4H candle** for each enabled symbol and sends you a Telegram message from the **filter system** built on the app's own indicators:

- **🟢 BUY signal** — **Trend lines + Volume + Oscillators** all agree on a closed 4H candle (after they did not all agree on the candle before)
  - Trend lines: price is above the 4H down ray and the 4H up ray still holds
  - Volume: the candle's volume is above its 20-candle average
  - Oscillators: the TradingView-style oscillators summary is Buy or Strong buy
- **⭐ A+ setup** — the same, and the **1D Structure** agrees too (latest daily BOS/CHoCH is up)
- Stop: 2×ATR below the close, then trailed up to the lowest low of the last 10 candles. Exit only at the stop.

Backtest, long only, after fees and funding: BTC 2018–2026 ≈ +0.46R per trade (393 trades), A+ ≈ +0.60R (245 trades); ZEC 2019–2026 ≈ +0.30R, A+ ≈ +0.40R. Gold showed no edge, so it is off. Each message lists every check (✅/❌).

| Message | When |
| --- | --- |
| 🟢 **BUY signal** / ⭐ **A+ BUY setup** | the filters agree on a closed 4H candle — with the stop to place and the size |
| 🔼 **Move your stop** | while in a trade, the 10-candle low rises — the new stop level |
| 🔴 **Stop hit** | the trade is closed, with the result in R after fees and funding, and the running paper-trading total |
| ☀️ **Daily status** | once a day (05:00 UTC = 08:00 Addis Ababa): position, stop, or the breakout level to watch, plus the 📒 paper-trading scorecard |

Rules are exactly the app's backtest, so live alerts and backtest results match. It costs nothing (GitHub Actions is free for public repositories).

## One-time setup (about 5 minutes)

1. **Create your bot.** In Telegram, open **@BotFather** → send `/newbot` → choose a name (e.g. *Addis-Trading Signals*) and a username ending in `bot`. BotFather replies with a **token** like `123456789:AA…`. Keep it secret.
2. **Find your chat id.** Send any message to your new bot (press *Start*). Then open **@userinfobot** in Telegram — it replies with your **Id** (a number like `123456789`).
3. **Add both to GitHub.** In your `signal-dashboard` repository: **Settings → Secrets and variables → Actions → New repository secret**
   - Name `TELEGRAM_BOT_TOKEN`, value = the token from step 1
   - Name `TELEGRAM_CHAT_ID`, value = the number from step 2
4. **Send a test.** **Actions** tab → **Donchian 4H alerts** → **Run workflow** → choose mode **`test`** → **Run workflow**. Within a minute you should get "✅ Addis-Trading Signals alerts are working" with the current status of each symbol.

5. **Make it really run every 15 minutes (important).** GitHub's own schedule is unreliable on free accounts — in the first week it ran only every 4–7 hours, so alerts came hours late. A free outside timer fixes this:
   1. **Make a GitHub token.** Click your profile photo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Name `cron-job`, expiration: the longest offered, **Repository access → Only select repositories → signal-dashboard**, **Permissions → Repository permissions → Actions: Read and write**. Generate and copy the token (starts with `github_pat_`).
   2. **Create the timer.** Sign up free at **cron-job.org** → **Create cronjob**:
      - URL: `https://api.github.com/repos/addiserp/signal-dashboard/actions/workflows/donchian-alerts.yml/dispatches`
      - Schedule: **every 15 minutes**
      - **Advanced** tab → Request method **POST**, and add these headers:
        `Authorization` = `Bearer github_pat_…your token…`, `Accept` = `application/vnd.github+json`, `Content-Type` = `application/json`
      - Request body: `{"ref":"main","inputs":{"mode":"auto"}}`
   3. Save and press **Test run**: the answer should be **204** (no content) — that means it worked. Then **Actions** in GitHub shows a new run every 15 minutes (event *workflow_dispatch*).

   When the token expires GitHub emails you; make a new one and paste it into the cron-job.org header.

That's it.

## Send alerts to more people

Everyone gets the same messages from your one bot.

1. Each person opens **your bot** in Telegram (search its @username) and presses **Start** — Telegram doesn't let a bot message someone who hasn't.
2. Each person gets their own **Id** from **@userinfobot** and sends it to you.
3. In GitHub, edit the `TELEGRAM_CHAT_ID` repository secret (**Settings → Secrets and variables → Actions → TELEGRAM_CHAT_ID → Update**) and list the ids separated by commas, for example `123456789,987654321,555444333`.
4. Run the **test** again — the run log says "delivered to 3 of 3 recipient(s)".

**For a bigger team, use a group:** create a Telegram group, add your bot to it, send one message in the group, then get the group's id (it starts with `-100…`; forward a group message to **@userinfobot** or **@RawDataBot** to see it) and add it to the list. New members then just join the group.

If one person can't be reached (for example they never pressed Start), the others still get every alert and the run shows a yellow warning naming that id.

## If the test message doesn't arrive

Open **Actions → Donchian 4H alerts → the latest run**. If something is wrong the run is **red** and the top of the page says exactly what:

| Message in the run | Fix |
| --- | --- |
| *TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret is empty or missing* | The secret isn't where GitHub Actions can read it. Add it under **Settings → Secrets and variables → Actions → Repository secrets** (not *Environment secrets*, *Codespaces* or *Dependabot*), with the exact name in capitals. |
| *doesn't look like a bot token* / *doesn't accept the bot token* | Copy the token again from @BotFather (`/mybots` → your bot → *API Token*). |
| *should be a number* | Use the numeric **Id** from @userinfobot, not a @username. |
| *chat not found* | Open your bot in Telegram and press **Start** once, then run the test again. |

A green run means the message was accepted by Telegram — check the chat with **your bot** (not @BotFather).

## Late alerts

If a run is late (or GitHub skipped some), the next run **catches up**: it sends every signal, stop-out and the newest stop move since the previous run, marked **⏰ Late alert** with how long ago the candle closed. A late BUY/SELL also says what to do now:

- ✅ **Still OK to enter** — price is within 0.5R of the signal price; enter with the stop shown.
- 🚫 **Don't chase** — price already ran more than 0.5R; skip it and wait for the next signal.
- ⏹ **Already over** — the trade was stopped out before the alert; nothing to do.

## Paper-trading scorecard

The backtest says the system earned about +0.15R to +0.25R per trade. The scorecard checks whether that holds **live, from today on**: every trade the alerts produce after `liveSince` is recorded (net of fees and funding) and the daily message shows *trades · wins · total R · average R*. Give it at least 20–30 trades before judging — that is several months on 4H. If the live average stays clearly below zero after that, stop trading the system with real money. The same scorecard is in the app (Analysis tab → *Tested system: Donchian 4H* → Paper trading since).

## Settings (`alerts/config.json`)

- `system` — `"filters"` (default, described above) or `"donchian"` (the older Donchian breakout alerts).
- `filters` — the filters that must agree for a BUY (default `["rays", "volume", "osc"]`); `aplus` — the extra filters for ⭐ A+ (default `["structure"]`). Names: `structure`, `rays`, `liquidity`, `volume`, `fib`, `osc`.
- `enabled` — turn a symbol on or off. BTC, ZEC, ETH and gold are on; crude oil (too little history) is off. Before turning a coin on, run it in the app: **Backtest → Trend following → Six filters only** with Trend lines + Volume + Oscillators switched on; turn it on only with 60+ trades and +0.15R or more per trade.
- `trend200` — only send signals while the symbol is above its 200-day average, measured on this Binance spot symbol (gold uses `PAXGUSDT`). Gold tested: 2020–2026 ≈ +0.14R per trade with this filter (2024–2026 ≈ +0.37R; 2020–2023 still lost), so gold messages are marked **watch-only** (`watchOnly` text).
- `sides` — `"long"` (buy signals only — **the tested system**) or `"both"` (also sell signals when a candle closes below the 20-candle low; shorts were not backtested positive, and the message says so).
- `accountUSDT` + `riskPct` — set your account size (e.g. `1000`) to get a position size in every buy message.
- `leverage` — the leverage you use on Binance futures (e.g. `5`). The buy message shows the margin needed and the rough liquidation price, and warns if liquidation would come **before** your stop (lower the leverage if it does).
- `feePct` / `fundingPct` — costs used for the net R (Binance VIP0 taker `0.05`; funding `0.01` per 8 hours).
- `liveSince` — start date of the paper-trading scorecard (`YYYY-MM-DD`). Change it to restart the count.
- `stopUpdates` — `false` if you only want buy and stop-hit messages.
- `earlyWarning` — `false` to turn off the ⚡ breakout-forming messages.
- `dailySummaryHourUTC` — hour of the daily status (UTC; Addis Ababa = UTC + 3).

## Good to know

- **Data source:** Binance first; if GitHub's US servers are blocked by Binance, it automatically uses Yahoo Finance (BTC-USD, CL=F). Each message says which source it used. Yahoo's crude oil is the CME future, which pauses at weekends and differs slightly from Binance's 24/7 CLUSDT.
- **Timing:** the job runs every 15 minutes, but GitHub can start scheduled jobs 5–30 minutes late when it's busy, so a signal may arrive a little after the candle closes. 4H candles close at 03:00, 07:00, 11:00, 15:00, 19:00 and 23:00 Addis Ababa time. Place your stop on the exchange — don't wait for the stop-hit message.
- **Crude oil is not backtested yet** (Binance CLUSDT started in April 2026). Treat its alerts as watch-only or trade very small.
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. If alerts stop, open **Actions** and re-enable the workflow (or push any small change).
- Not financial advice.
