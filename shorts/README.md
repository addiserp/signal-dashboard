# Daily market Short (YouTube Shorts + TikTok)

`make_short.py` turns the day's content into:
- `<slug>-short-youtube.mp4` (ends with a **Subscribe** card) and `<slug>-short-tiktok.mp4` (ends with **Follow us**), 1080×1920, ~50 s,
  with an optional AI voiceover (deep warm female) and original background music (`bull`, `bear` or `neutral`, made by `music.py`),
- `<slug>-thumbnail-youtube.png` (1280×720) and `<slug>-cover-tiktok.png` (1080×1920),
- `<slug>-sheet.png` (all scenes side by side, to check before sending).

## The daily routine

1. **Real charts:** run the **Chart snapshots** workflow (Actions → Chart snapshots → Run workflow, or
   `gh api -X POST repos/addiserp/signal-dashboard/actions/workflows/snapshot.yml/dispatches -f ref=main`).
   It opens the Live page on GitHub's servers with real Binance data and saves screenshots to the **`snaps`** branch
   (`BTCUSDT-4h.jpg`, `PAXGUSDT-4h.jpg` = gold, `ETHUSDT-4h.jpg`, `SOLUSDT-4h.jpg`, `BTCUSDT-1h.jpg`). The run log prints each
   symbol's price, 24h change, addis-4H Signals status and levels — use those numbers in the spec.
   Fetch: `git fetch origin +refs/heads/snaps:refs/remotes/origin/snaps && git archive refs/remotes/origin/snaps | tar -x -C SNAPS_DIR`
2. **News:** search today's Bitcoin, gold and US-stock headlines (2–3 reliable sources, note them for the caption).
3. **Spec:** copy `example-spec.json`, change `slug`, `day`, `date`, the hook, scenes and thumbnail. Scene types:
   `news` (optional `image` such as `BTCUSDT-4h-dxy`), `asset` (`price`, `change`, `up`, `chart`, `levels`), `system`
   (`image` such as `BTCUSDT-4h-sys`: the addis-4H Signals panel — show wins *and* losses honestly), `text`.
   Keep 5–6 scenes, short lines, facts with their source in `src`. Always keep "NOT FINANCIAL ADVICE" (built in).
   Give the hook and every scene a `"voice"` line (spoken text; hook ≤ ~3.5 s, scenes 1–2 short sentences, write numbers
   as words, e.g. "sixty thousand six hundred", and "P M I" / "G D P" for acronyms). Set `"mood"`: `bull` (market up),
   `bear` (market down) or `neutral` (sideways/mixed).
   **Weekends** (Sat/Sun): gold and US stocks are closed — crypto-only edition, ending with a week-ahead calendar scene.
4. **Build:** `pip install kokoro-onnx soundfile scipy --break-system-packages` (once), then
   `python3 shorts/make_short.py spec.json SNAPS_DIR OUT_DIR --voice --mood bull|bear|neutral`
   (the TTS model, ~120 MB, downloads to `~/.cache/addis-tts` on first use; `--music track.mp3` uses your own track instead).
5. **Check** `<slug>-sheet.png` and one frame of the video, then deliver the four files with a ready caption.
