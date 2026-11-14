# Daily market Short (YouTube Shorts + TikTok)

`make_short.py` turns the day's content into:
- `<slug>-short-youtube.mp4` and `<slug>-short-tiktok.mp4` (1080×1920, ~40 s; TikTok version silent — add a TikTok sound in the app),
- `<slug>-thumbnail-youtube.png` (1280×720), `<slug>-cover-tiktok.png` (1080×1920) and `<slug>-thumbnail-shorts.png`
  (1080×1920, centred — use this one for YouTube Shorts: the Shorts grid crops a 16:9 thumbnail),
- `<slug>-sheet.png` (all scenes side by side, to check before sending).

## The daily routine

1. **Real charts:** run the **Chart snapshots** workflow (Actions → Chart snapshots → Run workflow, or
   `gh api -X POST repos/addiserp/signal-dashboard/actions/workflows/snapshot.yml/dispatches -f ref=main`).
   It opens the Live page on GitHub's servers with real Binance data and saves screenshots to the **`snaps`** branch
   (`BTCUSDT-4h.jpg`, `PAXGUSDT-4h.jpg` = gold, `ETHUSDT-4h.jpg`, `SOLUSDT-4h.jpg`, `BTCUSDT-1h.jpg`). The run log prints each
   symbol's price, 24h change, addis-4H status and levels — use those numbers in the spec.
   Fetch: `git fetch origin +refs/heads/snaps:refs/remotes/origin/snaps && git archive refs/remotes/origin/snaps | tar -x -C SNAPS_DIR`
2. **News:** search today's Bitcoin, gold and US-stock headlines (2–3 reliable sources, note them for the caption).
3. **Spec:** copy `example-spec.json`, change `slug`, `day`, `date` (format `14 NOV 2026`; it is shown as `SATURDAY · NOV 14`), the hook
   (put the date in the hook title, e.g. `Saturday, Nov 14`, so the first frame shows it), scenes and thumbnail.
   Avoid the 📅 emoji: it renders as a calendar page with a fixed wrong date. Scene types:
   `news` (optional `image` such as `BTCUSDT-4h-dxy`), `asset` (`price`, `change`, `up`, `chart`, `levels`), `system`
   (`image` such as `BTCUSDT-4h-sys`: the addis-4H panel — show wins *and* losses honestly), `text`.
   Keep 5–6 scenes, short lines, facts with their source in `src`. Always keep "NOT FINANCIAL ADVICE" (built in).
4. **Build:** `python3 shorts/make_short.py spec.json SNAPS_DIR OUT_DIR [--music track.mp3 --music-start 20]`
   (no music file is stored in this public repo; YouTube Audio Library tracks may not be redistributed).
5. **Check** `<slug>-sheet.png` and one frame of the video, then deliver the four files with a ready caption.
