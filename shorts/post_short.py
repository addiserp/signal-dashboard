#!/usr/bin/env python3
"""Post the day's Short to YouTube and TikTok (run by .github/workflows/post-short.yml).

Usage:  python3 post_short.py DIR
  DIR holds the files from the "shorts" branch: <slug>-short-youtube.mp4, <slug>-short-tiktok.mp4,
  <slug>-thumbnail-youtube.png and meta.json:
    {"slug": "thursday-2026-11-26", "title": "BTC BOUNCES · Thu 26 Nov 2026 | Addis 4H #Shorts",
     "caption": "... #Addis4H ... Not financial advice", "sources": ["https://...", ...], "tags": ["bitcoin", ...]}

Environment (GitHub secrets / variables). A platform whose secrets are missing is skipped, not an error.
  YouTube: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN; YT_PRIVACY (public | unlisted | private, default public)
  TikTok:  TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN;
           TIKTOK_PRIVACY (default SELF_ONLY — unaudited TikTok apps may only post privately;
           set PUBLIC_TO_EVERYONE once TikTok has approved the app)
Only the Python standard library is used.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

D = sys.argv[1]
meta = json.load(open(os.path.join(D, "meta.json")))
slug = meta["slug"]
env = lambda k, d=None: (os.environ.get(k) or d)
failed = []


def http(method, url, data=None, headers=None, raw=None):
    body = raw if raw is not None else (json.dumps(data).encode() if isinstance(data, (dict, list)) else
                                        urllib.parse.urlencode(data).encode() if data else None)
    h = dict(headers or {})
    if isinstance(data, (dict, list)): h.setdefault("Content-Type", "application/json; charset=UTF-8")
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            txt = r.read().decode() or "{}"
            return r.status, dict(r.headers), (json.loads(txt) if txt.strip().startswith(("{", "[")) else txt)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        raise SystemExit(f"{method} {url.split('?')[0]} → HTTP {e.code}: {txt[:800]}")


def description():
    src = meta.get("sources") or []
    return meta["caption"] + ("\n\nSources:\n" + "\n".join(src) if src else "")


# ---------------- YouTube ----------------
def youtube():
    cid, sec, rt = env("YT_CLIENT_ID"), env("YT_CLIENT_SECRET"), env("YT_REFRESH_TOKEN")
    if not (cid and sec and rt):
        print("YouTube: secrets YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN not set — skipped"); return
    _, _, tok = http("POST", "https://oauth2.googleapis.com/token",
                     {"client_id": cid, "client_secret": sec, "refresh_token": rt, "grant_type": "refresh_token"})
    auth = {"Authorization": "Bearer " + tok["access_token"]}
    video = os.path.join(D, f"{slug}-short-youtube.mp4"); size = os.path.getsize(video)
    body = {"snippet": {"title": meta["title"][:100], "description": description()[:4900],
                        "tags": meta.get("tags", []), "categoryId": "25"},   # 25 = News & Politics
            "status": {"privacyStatus": env("YT_PRIVACY", "public"), "selfDeclaredMadeForKids": False}}
    _, hdr, _ = http("POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                     body, {**auth, "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    loc = hdr.get("Location") or hdr.get("location")
    _, _, v = http("PUT", loc, raw=open(video, "rb").read(), headers={**auth, "Content-Type": "video/mp4"})
    vid = v["id"]
    print(f"YouTube: uploaded https://youtube.com/shorts/{vid} (privacy {v.get('status', {}).get('privacyStatus')})")
    if v.get("status", {}).get("privacyStatus") == "private" and env("YT_PRIVACY", "public") != "private":
        print("YouTube: the video is PRIVATE — the Google Cloud project is not audited yet; make it public in YouTube Studio")
    thumb = os.path.join(D, f"{slug}-thumbnail-youtube.png")
    if os.path.exists(thumb):
        try:
            http("POST", f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={vid}",
                 raw=open(thumb, "rb").read(), headers={**auth, "Content-Type": "image/png"})
            print("YouTube: thumbnail set")
        except SystemExit as e:   # custom thumbnails need a verified channel; Shorts may ignore them
            print(f"YouTube: thumbnail not set ({e})")


# ---------------- TikTok ----------------
def tiktok():
    ck, cs, rt = env("TIKTOK_CLIENT_KEY"), env("TIKTOK_CLIENT_SECRET"), env("TIKTOK_REFRESH_TOKEN")
    if not (ck and cs and rt):
        print("TikTok: secrets TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REFRESH_TOKEN not set — skipped"); return
    _, _, tok = http("POST", "https://open.tiktokapis.com/v2/oauth/token/",
                     {"client_key": ck, "client_secret": cs, "grant_type": "refresh_token", "refresh_token": rt},
                     {"Content-Type": "application/x-www-form-urlencoded"})
    if "access_token" not in tok: raise SystemExit(f"TikTok token refresh failed: {tok}")
    if tok.get("refresh_token") and tok["refresh_token"] != rt:
        print("TikTok: NOTE — TikTok issued a new refresh token; if posting fails later, run get_tokens.py tiktok again")
    auth = {"Authorization": "Bearer " + tok["access_token"]}
    _, _, info = http("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {}, auth)
    opts = info.get("data", {}).get("privacy_level_options", [])
    want = env("TIKTOK_PRIVACY", "SELF_ONLY")
    privacy = want if want in opts else ("SELF_ONLY" if "SELF_ONLY" in opts else (opts or [want])[0])
    video = os.path.join(D, f"{slug}-short-tiktok.mp4"); size = os.path.getsize(video)
    title = meta["caption"][:2200]
    _, _, init = http("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", {
        "post_info": {"title": title, "privacy_level": privacy, "disable_duet": False, "disable_comment": False,
                      "disable_stitch": False, "video_cover_timestamp_ms": 1000},
        "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}}, auth)
    d = init.get("data", {})
    if "upload_url" not in d: raise SystemExit(f"TikTok init failed: {init}")
    http("PUT", d["upload_url"], raw=open(video, "rb").read(),
         headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}"})
    for _ in range(30):
        time.sleep(10)
        _, _, st = http("POST", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", {"publish_id": d["publish_id"]}, auth)
        s = st.get("data", {}).get("status")
        if s in ("PUBLISH_COMPLETE", "FAILED"): break
    print(f"TikTok: {s} (privacy {privacy}){' — reason: ' + str(st['data'].get('fail_reason')) if s == 'FAILED' else ''}")
    if s == "FAILED": raise SystemExit("TikTok post failed")
    if privacy == "SELF_ONLY": print("TikTok: posted as PRIVATE (only you) — make it public in the TikTok app")


for name, fn in (("YouTube", youtube), ("TikTok", tiktok)):
    try: fn()
    except SystemExit as e: print(f"{name}: ERROR {e}"); failed.append(name)
if failed: sys.exit(f"failed: {', '.join(failed)}")
