# Daily market Short (YouTube Shorts + TikTok)

`make_short.py` turns the day's content into:
- `<slug>-short-youtube.mp4` and `<slug>-short-tiktok.mp4` (1080×1920, ~40 s; TikTok version silent — add a TikTok sound in the app),
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
4. **Build:** `python3 shorts/make_short.py spec.json SNAPS_DIR OUT_DIR [--music track.mp3 --music-start 20]`
   (no music file is stored in this public repo; YouTube Audio Library tracks may not be redistributed).
5. **Check** `<slug>-sheet.png` and one frame of the video, then deliver the four files with a ready caption.
6. **Post (automatic, free):** push the four files plus `meta.json` to the **`shorts`** branch (replacing the previous day),
   then run the **Post Short** workflow (`.github/workflows/post-short.yml`). It uploads the Short to YouTube (with the
   thumbnail) and TikTok using `post_short.py`. `meta.json`:
   `{"slug": "...", "title": "BTC BOUNCES · Thu 26 Nov 2026 | Addis 4H #Shorts", "caption": "... #Addis4H ... Not financial advice", "sources": ["https://..."], "tags": ["bitcoin", "gold"]}`
   ```
   cd OUT_DIR && git init -q -b shorts && cp ../meta.json . && git add *.mp4 *-thumbnail-youtube.png *-cover-tiktok.png meta.json \
     && git commit -qm "short SLUG" && git push -fq https://github.com/addiserp/signal-dashboard HEAD:refs/heads/shorts
   ```

## One-time setup for auto-posting (no fees)

Both platforms keep API uploads **private** until they have reviewed the app (the reviews are free). Until then, make
each post public with one tap in YouTube Studio / the TikTok app. A platform without its secrets is simply skipped.

**YouTube**
1. console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. OAuth consent screen: External, add yourself, then **Publish app** ("In production"). In "Testing" mode the token stops working after 7 days.
3. Credentials → Create OAuth client ID → **Desktop app**. Note the client ID and secret.
4. On your computer: `python3 shorts/get_tokens.py youtube CLIENT_ID CLIENT_SECRET` (sign in with the Addis 4H channel's account; ignore the "unverified app" warning, it's your own app).
5. Repo secrets: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.
6. To post publicly without the manual tap: submit the free YouTube API audit form (search "YouTube API Services audit and quota extension form").
   Custom thumbnails need a verified channel (youtube.com/verify).

**TikTok**
1. developers.tiktok.com → Manage apps → create an app; add **Login Kit** and **Content Posting API** (turn on Direct Post); scopes `user.info.basic`, `video.publish`.
2. Redirect URI: `https://addiserp.github.io/signal-dashboard/`.
3. On your computer: `python3 shorts/get_tokens.py tiktok CLIENT_KEY CLIENT_SECRET`, approve, paste back the address you land on.
4. Repo secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` (valid about a year — rerun step 3 when it expires).
5. Submit the app for review; once approved, set the repo **variable** `TIKTOK_PRIVACY` = `PUBLIC_TO_EVERYONE`.
