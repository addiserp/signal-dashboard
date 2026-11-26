#!/usr/bin/env python3
"""
Addis 4H stream watchdog — keeps the YouTube live stream running.

Every minute it checks two things:
  1. OBS: is OBS running, is it streaming, and is data still flowing? (through OBS's built-in WebSocket server)
  2. YouTube: does the channel's /live page show a live broadcast right now?

A problem must be seen several checks in a row before it acts (default 3 = about 3 minutes), then it:
  - OBS not responding / crashed        -> restarts OBS (with --startstreaming, so it goes live again)
  - OBS running but not streaming        -> presses Start Streaming
  - OBS streaming but YouTube not live   -> stops and restarts the stream; after 2 tries that don't help -> restarts OBS
  - no internet                          -> waits (restarting would not help)
Each action can send you a Telegram message. Everything is written to watchdog.log.

Run:   python3 obs_watchdog.py                 (uses watchdog.ini next to this file)
Test:  python3 obs_watchdog.py --check-once    (one check, prints what it sees, changes nothing)
Safe:  python3 obs_watchdog.py --dry-run       (full loop, but only logs what it WOULD do)
"""
import argparse
import configparser
import json
import logging
import os
import re
import shlex
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from logging.handlers import RotatingFileHandler

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
log = logging.getLogger("watchdog")

DEFAULTS = {
    "obs": {"host": "localhost", "port": "4455", "password": "",
            "launch_cmd": "obs --startstreaming --disable-shutdown-check --minimize-to-tray",
            "process_name": "obs", "start_wait_sec": "40"},
    "youtube": {"channel": "https://www.youtube.com/@addis-chart-signals", "check": "yes"},
    "check": {"interval_sec": "60", "confirm": "3", "grace_sec": "180", "stream_restarts_before_obs_restart": "2",
              "max_obs_restarts_per_hour": "4"},
    "telegram": {"bot_token": "", "chat_id": ""},
    "log": {"file": "watchdog.log"},
}


def load_config(path):
    cp = configparser.ConfigParser(interpolation=None)
    cp.read_dict(DEFAULTS)
    if path and os.path.exists(path):
        cp.read(path, encoding="utf-8")
    return cp


# ------------------------------------------------------------------ YouTube
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36")


def parse_live_page(html):
    """Read a channel's /live page. Returns (state, video_id).
    state: 'live', 'upcoming', 'offline', or None when the page can't be judged (e.g. a YouTube bot check)."""
    vid = None
    m = (re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', html)
         or re.search(r'"currentVideoEndpoint":\{.{0,400}?"videoId":"([\w-]{11})"', html))
    if m:
        vid = m.group(1)
    if (re.search(r'"isLiveNow"\s*:\s*true', html)
            # the view counter under a live video: {"text":"12 watching now"}]},"isLive":true
            or re.search(r'"isLive"\s*:\s*true\s*,\s*"extraShortViewCount"', html)
            or re.search(r'watching now"\}\]\}\s*,\s*"isLive"\s*:\s*true', html)):
        return "live", vid
    if re.search(r'"isUpcoming"\s*:\s*true', html) or '"upcomingEventData"' in html:
        return "upcoming", vid
    # a live watch page without the microformat: playability says it is live content and no end time
    if vid and re.search(r'"isLive"\s*:\s*true', html) and not re.search(r'"endTimestamp"', html):
        return "live", vid
    if "confirm you\u2019re not a bot" in html or "confirm you're not a bot" in html:
        return None, vid          # can't tell: never restart because of this
    return "offline", vid


def youtube_state(channel, timeout=15):
    """'live' / 'upcoming' / 'offline', or None when YouTube could not be reached (no internet etc.)."""
    url = channel.rstrip("/") + "/live"
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
                         cookies={"CONSENT": "YES+cb", "SOCS": "CAI"}, timeout=timeout)
        if r.status_code >= 500 or r.status_code == 429:
            return None, None
        state, vid = parse_live_page(r.text)
        if state is None:
            log.debug("YouTube answered with a bot check; live state unknown")
        return state, vid
    except requests.RequestException as e:
        log.debug("YouTube check failed: %s", e)
        return None, None


def internet_ok(timeout=8):
    for u in ("https://www.google.com/generate_204", "https://cloudflare.com/cdn-cgi/trace"):
        try:
            if requests.get(u, timeout=timeout).status_code < 500:
                return True
        except requests.RequestException:
            pass
    return False


# ------------------------------------------------------------------ OBS
@dataclass
class ObsStatus:
    reachable: bool
    streaming: bool = False
    reconnecting: bool = False
    bytes: int = 0
    skipped: int = 0
    total: int = 0
    error: str = ""


class Obs:
    def __init__(self, cfg, dry_run=False):
        self.host = cfg.get("obs", "host")
        self.port = cfg.getint("obs", "port")
        self.password = cfg.get("obs", "password")
        self.launch_cmd = cfg.get("obs", "launch_cmd")
        self.process_name = cfg.get("obs", "process_name")
        self.start_wait = cfg.getint("obs", "start_wait_sec")
        self.dry_run = dry_run

    def _client(self):
        import obsws_python as obs  # imported here so --help works without it
        return obs.ReqClient(host=self.host, port=self.port, password=self.password, timeout=5)

    def status(self):
        try:
            cl = self._client()
            try:
                s = cl.get_stream_status()
                return ObsStatus(True, bool(s.output_active), bool(s.output_reconnecting), int(s.output_bytes or 0),
                                 int(s.output_skipped_frames or 0), int(s.output_total_frames or 0))
            finally:
                try:
                    cl.disconnect()
                except Exception:
                    pass
        except Exception as e:
            return ObsStatus(False, error=f"{type(e).__name__}: {e}")

    def start_stream(self):
        if self.dry_run:
            log.info("[dry-run] would press Start Streaming"); return True
        try:
            cl = self._client(); cl.start_stream(); cl.disconnect(); return True
        except Exception as e:
            log.warning("Start Streaming failed: %s", e); return False

    def restart_stream(self):
        if self.dry_run:
            log.info("[dry-run] would stop and restart the stream"); return True
        try:
            cl = self._client()
            try:
                cl.stop_stream()
            except Exception as e:
                log.info("Stop Streaming: %s", e)
            for _ in range(20):                    # wait until OBS says it stopped
                time.sleep(1)
                try:
                    if not cl.get_stream_status().output_active:
                        break
                except Exception:
                    break
            time.sleep(5)
            cl.start_stream(); cl.disconnect(); return True
        except Exception as e:
            log.warning("Restarting the stream failed: %s", e); return False

    def running(self):
        try:
            return subprocess.run(["pgrep", "-x", self.process_name], capture_output=True).returncode == 0
        except FileNotFoundError:
            return True  # no pgrep (Windows): assume yes

    def restart_obs(self):
        if self.dry_run:
            log.info("[dry-run] would close OBS and start it again with: %s", self.launch_cmd); return True
        if self.running():
            log.info("Closing OBS…")
            subprocess.run(["pkill", "-TERM", "-x", self.process_name])
            for _ in range(15):
                time.sleep(1)
                if not self.running():
                    break
            if self.running():
                log.info("OBS did not close — forcing it")
                subprocess.run(["pkill", "-KILL", "-x", self.process_name]); time.sleep(2)
        log.info("Starting OBS: %s", self.launch_cmd)
        subprocess.Popen(shlex.split(self.launch_cmd), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, cwd=os.path.expanduser("~"))
        # wait for the WebSocket server, then make sure the stream is on
        deadline = time.time() + self.start_wait + 60
        while time.time() < deadline:
            time.sleep(3)
            st = self.status()
            if st.reachable:
                if not st.streaming:
                    time.sleep(5); self.start_stream()
                return True
        log.warning("OBS did not come back within %s s", self.start_wait + 60)
        return False


# ------------------------------------------------------------------ Telegram
class Notifier:
    def __init__(self, cfg, dry_run=False):
        self.token = cfg.get("telegram", "bot_token").strip()
        self.chat = cfg.get("telegram", "chat_id").strip()
        self.dry_run = dry_run

    def send(self, text):
        log.info("NOTICE: %s", text)
        if not (self.token and self.chat) or self.dry_run:
            return
        try:
            requests.post(f"https://api.telegram.org/bot{self.token}/sendMessage",
                          data={"chat_id": self.chat, "text": "🛠 Stream watchdog: " + text}, timeout=10)
        except requests.RequestException as e:
            log.warning("Telegram message failed: %s", e)


# ------------------------------------------------------------------ the watchdog
@dataclass
class Counters:
    obs_down: int = 0
    not_streaming: int = 0
    stalled: int = 0
    yt_offline: int = 0
    stream_restarts: int = 0            # stream restarts since YouTube was last seen live
    obs_restarts: list = field(default_factory=list)


class Watchdog:
    def __init__(self, cfg, obs, notifier, yt=youtube_state, net=internet_ok, clock=time.time, sleep=time.sleep):
        self.cfg = cfg
        self.obs, self.n = obs, notifier
        self.yt, self.net, self.clock, self.sleep = yt, net, clock, sleep
        self.channel = cfg.get("youtube", "channel")
        self.check_yt = cfg.getboolean("youtube", "check")
        self.confirm = cfg.getint("check", "confirm")
        self.grace = cfg.getint("check", "grace_sec")
        self.max_stream_restarts = cfg.getint("check", "stream_restarts_before_obs_restart")
        self.max_obs_per_hour = cfg.getint("check", "max_obs_restarts_per_hour")
        self.c = Counters()
        self.quiet_until = 0.0
        self.last_bytes = None
        self.was_live = None

    def _grace(self, why):
        self.quiet_until = self.clock() + self.grace
        log.info("Waiting %s s for %s", self.grace, why)

    def _restart_obs(self, why):
        now = self.clock()
        self.c.obs_restarts = [t for t in self.c.obs_restarts if now - t < 3600]
        if len(self.c.obs_restarts) >= self.max_obs_per_hour:
            self.n.send(f"{why} — but OBS was already restarted {len(self.c.obs_restarts)} times in the last hour. "
                        "Not restarting again; please check the computer.")
            self._grace("the next try"); return
        self.n.send(f"{why} → restarting OBS.")
        self.c.obs_restarts.append(now)
        ok = self.obs.restart_obs()
        self.c = Counters(obs_restarts=self.c.obs_restarts)
        self.last_bytes = None
        if not ok:
            self.n.send("OBS did not start again. Please check the computer.")
        self._grace("OBS and YouTube to come back")

    def step(self):
        """One check. Returns a short text of what it saw (also logged)."""
        now = self.clock()
        st = self.obs.status()
        # data must keep flowing while streaming
        stalled = False
        if st.reachable and st.streaming:
            if self.last_bytes is not None and st.bytes <= self.last_bytes and not st.reconnecting:
                stalled = True
            self.last_bytes = st.bytes
        else:
            self.last_bytes = None

        yt_state, vid = (None, None)
        if self.check_yt and st.reachable and st.streaming and not stalled:
            yt_state, vid = self.yt(self.channel)

        seen = (f"OBS: {'not reachable (' + st.error + ')' if not st.reachable else ('streaming' if st.streaming else 'NOT streaming')}"
                f"{' (reconnecting)' if st.reconnecting else ''}{' (no data flowing)' if stalled else ''}"
                f" · YouTube: {yt_state or ('—' if not self.check_yt or not (st.reachable and st.streaming) else 'unknown')}"
                f"{' (' + vid + ')' if vid else ''}")
        log.info(seen)

        if now < self.quiet_until:
            if yt_state == "live":
                self.quiet_until = 0
            else:
                return seen + " · waiting after the last action"

        # 1. OBS not reachable
        if not st.reachable:
            self.c.obs_down += 1
            if self.c.obs_down >= self.confirm:
                self._restart_obs("OBS is not responding" if self.obs.running() else "OBS is not running")
            return seen
        self.c.obs_down = 0

        # 2. not streaming (or the stream is stuck)
        if not st.streaming or stalled:
            key = "stalled" if stalled else "not_streaming"
            setattr(self.c, key, getattr(self.c, key) + 1)
            if getattr(self.c, key) >= self.confirm:
                if not self.net():
                    log.info("No internet — waiting instead of restarting"); return seen + " · no internet"
                setattr(self.c, key, 0)
                if stalled:
                    self.n.send("OBS says it is streaming but no data is going out → restarting the stream.")
                    self.obs.restart_stream()
                else:
                    self.n.send("OBS stopped streaming → pressing Start Streaming.")
                    if not self.obs.start_stream():
                        self._restart_obs("Start Streaming did not work"); return seen
                self.c.stream_restarts += 1
                self._grace("the stream to start")
            return seen
        self.c.not_streaming = self.c.stalled = 0

        # 3. OBS streams, but is the channel live on YouTube?
        if not self.check_yt:
            return seen
        if yt_state is None:
            return seen + " · YouTube not reachable, not counting"
        if yt_state == "live":
            if self.was_live is False:
                self.n.send(f"YouTube is live again ✅ ({vid or 'channel live'}).")
            self.was_live = True
            self.c.yt_offline = 0
            self.c.stream_restarts = 0
            return seen
        self.c.yt_offline += 1
        if self.c.yt_offline >= self.confirm:
            if not self.net():
                log.info("No internet — waiting"); return seen + " · no internet"
            self.was_live = False
            self.c.yt_offline = 0
            if self.c.stream_restarts >= self.max_stream_restarts:
                self._restart_obs(f"YouTube is still not live after {self.c.stream_restarts} stream restarts")
            else:
                self.n.send(f"OBS is streaming but YouTube shows the channel as {yt_state} → restarting the stream.")
                self.obs.restart_stream()
                self.c.stream_restarts += 1
                self._grace("YouTube to show the live again")
        return seen

    def run(self, interval):
        self.n.send(f"started — watching OBS and {self.channel}/live every {interval} s.")
        while True:
            try:
                self.step()
            except Exception as e:  # never die
                log.exception("check failed: %s", e)
            self.sleep(interval)


def main():
    ap = argparse.ArgumentParser(description="Keep OBS streaming and the YouTube live running.")
    ap.add_argument("--config", default=os.path.join(HERE, "watchdog.ini"))
    ap.add_argument("--check-once", action="store_true", help="check once, print, change nothing")
    ap.add_argument("--dry-run", action="store_true", help="run the loop but only log what it would do")
    ap.add_argument("--test-telegram", action="store_true", help="send a test Telegram message and exit")
    ap.add_argument("--channel", help="override [youtube] channel, e.g. https://www.youtube.com/@addis4h")
    a = ap.parse_args()

    try:
        import obsws_python  # noqa: F401  (without it every check would look like "OBS crashed")
    except ImportError:
        print("The OBS library is missing for this Python (" + sys.executable + "). Install it with:\n"
              "  " + sys.executable + " -m pip install --user obsws-python requests\n"
              "If pip says 'externally-managed-environment', add --break-system-packages to that line.")
        sys.exit(2)
    cfg = load_config(a.config)
    if a.channel:
        cfg.set("youtube", "channel", a.channel)
    logfile = cfg.get("log", "file")
    if not os.path.isabs(logfile):
        logfile = os.path.join(HERE, logfile)
    handlers = [logging.StreamHandler(sys.stdout), RotatingFileHandler(logfile, maxBytes=2_000_000, backupCount=3, encoding="utf-8")]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S", handlers=handlers)

    if not os.path.exists(a.config):
        log.warning("No config file at %s — using the defaults (copy watchdog.example.ini to watchdog.ini).", a.config)

    dry = a.dry_run or a.check_once
    obs, n = Obs(cfg, dry_run=dry), Notifier(cfg, dry_run=a.check_once)
    if a.test_telegram:
        if not (n.token and n.chat):
            print("Fill in [telegram] bot_token and chat_id in watchdog.ini first."); return 1
        n.send("test message — the watchdog can reach you."); return 0
    if a.check_once:
        st = obs.status()
        print(f"OBS      : {'reachable' if st.reachable else 'NOT reachable — ' + st.error}")
        if st.reachable:
            print(f"Streaming: {st.streaming}  reconnecting: {st.reconnecting}  sent: {st.bytes/1e6:.1f} MB  "
                  f"skipped frames: {st.skipped}/{st.total}")
        state, vid = youtube_state(cfg.get("youtube", "channel"))
        print(f"YouTube  : {state or 'could not reach YouTube'}{' — https://youtu.be/' + vid if vid else ''}")
        print(f"Internet : {'ok' if internet_ok() else 'NOT reachable'}")
        return 0

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    Watchdog(cfg, obs, n).run(cfg.getint("check", "interval_sec"))


if __name__ == "__main__":
    sys.exit(main())
