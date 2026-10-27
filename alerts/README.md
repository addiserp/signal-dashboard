# Donchian 4H alerts on Telegram

Every hour, GitHub checks the latest **closed 4H candle** for each enabled symbol and sends you a Telegram message when the Donchian system (the one that tested positive on BTC 4H):

| Message | When |
| --- | --- |
| 🟢 **BUY signal** | a 4H candle closes above the highest high of the previous 20 candles — with the stop to place (2×ATR) |
| 🔼 **Move your stop** | while in a trade, the 10-candle low rises — the new stop level |
| 🔴 **Stop hit** | the trade is closed, with the result in R |
| ☀️ **Daily status** | once a day (05:00 UTC = 08:00 Addis Ababa): position, stop, or the breakout level to watch |

Rules are exactly the app's backtest, so live alerts and backtest results match. It costs nothing (GitHub Actions is free for public repositories).

## One-time setup (about 5 minutes)

1. **Create your bot.** In Telegram, open **@BotFather** → send `/newbot` → choose a name (e.g. *AddisERP Signals*) and a username ending in `bot`. BotFather replies with a **token** like `123456789:AA…`. Keep it secret.
2. **Find your chat id.** Send any message to your new bot (press *Start*). Then open **@userinfobot** in Telegram — it replies with your **Id** (a number like `123456789`).
3. **Add both to GitHub.** In your `signal-dashboard` repository: **Settings → Secrets and variables → Actions → New repository secret**
   - Name `TELEGRAM_BOT_TOKEN`, value = the token from step 1
   - Name `TELEGRAM_CHAT_ID`, value = the number from step 2
4. **Send a test.** **Actions** tab → **Donchian 4H alerts** → **Run workflow** → mode `test` → **Run workflow**. Within a minute you should get "✅ AddisERP Signals alerts are working" with the current status of each symbol.

That's it — from now on it runs by itself every hour.

## Settings (`alerts/config.json`)

- `enabled` — turn a symbol on or off. BTCUSDT and crude oil are on; ETH and gold are off (gold lost money in the 4H backtest).
- `sides` — `"long"` (buy signals only) or `"both"` (also sell signals when a candle closes below the 20-candle low).
- `accountUSDT` + `riskPct` — set your account size (e.g. `1000`) to get a position size in every buy message.
- `stopUpdates` — `false` if you only want buy and stop-hit messages.
- `dailySummaryHourUTC` — hour of the daily status (UTC; Addis Ababa = UTC + 3).

## Good to know

- **Data source:** Binance first; if GitHub's US servers are blocked by Binance, it automatically uses Yahoo Finance (BTC-USD, CL=F). Each message says which source it used. Yahoo's crude oil is the CME future, which pauses at weekends and differs slightly from Binance's 24/7 CLUSDT.
- **Timing:** GitHub can start scheduled jobs 5–30 minutes late, so a signal may arrive a little after the candle closes. Place your stop on the exchange — don't wait for the stop-hit message.
- **Crude oil is not backtested yet** (Binance CLUSDT started in April 2026). Treat its alerts as watch-only or trade very small.
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. If alerts stop, open **Actions** and re-enable the workflow (or push any small change).
- Not financial advice.
