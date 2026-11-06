# AddisERP Signals

The one backtested system (Donchian 4H breakout) with paper-trading log and position calculator, plus technical signals (TradingView), top-down trend rays, BOS/CHoCH, order blocks, HTF liquidity, FVG, volume and Fibonacci for BTC, ETH, gold, SPCX, ZEC, HYPE and NEAR.

- `docs/` – installable web app (PWA). Turn on GitHub Pages (Settings → Pages → Branch `main`, folder `/docs`) to host it, then open the link on your phone and choose **Install app** / **Add to Home Screen**.
- Android app (WebView) – the rest of this repository. GitHub Actions builds `AddisERP-Signals.apk` on every push: **Actions → Build Android APK → latest run → Artifacts**.

- `alerts/` – Telegram alerts for the 4H filter system (Trend lines + Volume + Oscillators, ⭐ A+ when the 1D structure agrees), checked every 15 minutes, with a live paper-trading scorecard. Setup: [alerts/README.md](alerts/README.md).
- **APK updates without uninstalling:** add the signing key once — see [SIGNING.md](SIGNING.md).

To update the dashboard, replace `docs/index.html` and `app/src/main/assets/index.html` with the new version.

Not financial advice.
