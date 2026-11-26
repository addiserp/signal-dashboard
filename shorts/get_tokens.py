#!/usr/bin/env python3
"""One-time helper: get the refresh tokens that post_short.py needs. Run it on your own computer.

  python3 get_tokens.py youtube CLIENT_ID CLIENT_SECRET
      Google Cloud "Desktop app" OAuth client. A browser opens; sign in with the account that owns the
      Addis 4H channel. Prints YT_REFRESH_TOKEN.

  python3 get_tokens.py tiktok CLIENT_KEY CLIENT_SECRET [REDIRECT_URI]
      TikTok developer app with Login Kit + Content Posting API. REDIRECT_URI must be registered in the app
      (default https://addiserp.github.io/signal-dashboard/). After you approve, the browser lands on that page;
      copy the whole address from the address bar and paste it here. Prints TIKTOK_REFRESH_TOKEN.

Save the printed values as GitHub secrets (repo → Settings → Secrets and variables → Actions).
Only the Python standard library is used.
"""
import http.server, json, secrets, sys, urllib.parse, urllib.request, webbrowser


def post(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read().decode())


def youtube(cid, sec):
    got = {}
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            got.update(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query))
            self.send_response(200); self.end_headers(); self.wfile.write(b"Done - you can close this tab.")
        def log_message(self, *a): pass
    srv = http.server.HTTPServer(("127.0.0.1", 0), H); redirect = f"http://127.0.0.1:{srv.server_port}"
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "access_type": "offline", "prompt": "consent",
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"})
    print("Opening:", url); webbrowser.open(url)
    while "code" not in got and "error" not in got: srv.handle_request()
    if "error" in got: sys.exit(f"Google said: {got['error']}")
    tok = post("https://oauth2.googleapis.com/token", {"code": got["code"][0], "client_id": cid, "client_secret": sec,
                                                         "redirect_uri": redirect, "grant_type": "authorization_code"})
    if "refresh_token" not in tok: sys.exit(f"No refresh token: {tok}")
    print("\nYT_REFRESH_TOKEN =", tok["refresh_token"])


def tiktok(ck, cs, redirect):
    state = secrets.token_urlsafe(16)
    url = "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": ck, "scope": "user.info.basic,video.publish", "response_type": "code",
        "redirect_uri": redirect, "state": state})
    print("Opening:", url); webbrowser.open(url)
    back = input("\nPaste the full address you landed on: ").strip()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(back).query)
    if q.get("state", [""])[0] != state: sys.exit("state mismatch — start again")
    if "code" not in q: sys.exit(f"TikTok said: {q}")
    tok = post("https://open.tiktokapis.com/v2/oauth/token/", {"client_key": ck, "client_secret": cs,
               "code": q["code"][0], "grant_type": "authorization_code", "redirect_uri": redirect})
    if "refresh_token" not in tok: sys.exit(f"No refresh token: {tok}")
    print("\nTIKTOK_REFRESH_TOKEN =", tok["refresh_token"], f"\n(valid ~{tok.get('refresh_expires_in', 0) // 86400} days)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 3 and a[0] == "youtube": youtube(a[1], a[2])
    elif len(a) >= 3 and a[0] == "tiktok": tiktok(a[1], a[2], a[3] if len(a) > 3 else "https://addiserp.github.io/signal-dashboard/")
    else: sys.exit(__doc__)
