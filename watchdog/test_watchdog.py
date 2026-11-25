# Scenario tests with a fake OBS and a fake YouTube (no network, no real OBS needed): python3 test_watchdog.py
import logging, unittest
import obs_watchdog as W

class FakeObs:
    def __init__(self): self.reach, self.stream, self.bytes, self.actions, self.proc = True, True, 0, [], True
    def status(self):
        if not self.reach: return W.ObsStatus(False, error="ConnectionRefusedError")
        if self.stream: self.bytes += 1000
        return W.ObsStatus(True, self.stream, False, self.bytes)
    def start_stream(self): self.actions.append("start"); self.stream = True; return True
    def restart_stream(self): self.actions.append("restart_stream"); self.stream = True; return True
    def restart_obs(self): self.actions.append("restart_obs"); self.reach = True; self.stream = True; return True
    def running(self): return self.proc

class Clock:
    def __init__(self): self.t = 0
    def __call__(self): return self.t

class Notes:
    def __init__(self): self.msgs = []
    def send(self, m): self.msgs.append(m)

def make(yt_states):
    cfg = W.load_config(None); obs, n, clock = FakeObs(), Notes(), Clock()
    it = iter(yt_states)
    def yt(_): s = next(it, "live"); return (s, "abcdefghijk" if s == "live" else None)
    w = W.Watchdog(cfg, obs, n, yt=yt, net=lambda: True, clock=clock, sleep=lambda s: None)
    def tick(k=1):
        for _ in range(k): w.step(); clock.t += 60
    return w, obs, n, tick

class T(unittest.TestCase):
    def test_healthy(self):
        w, obs, n, tick = make(["live"] * 10); tick(10); self.assertEqual(obs.actions, [])
    def test_short_blip_ignored(self):
        w, obs, n, tick = make(["live", "offline", "offline", "live", "live"]); tick(5); self.assertEqual(obs.actions, [])
    def test_youtube_down_restarts_stream_then_obs(self):
        w, obs, n, tick = make(["offline"] * 40)
        tick(3); self.assertEqual(obs.actions, ["restart_stream"])           # confirmed after 3 checks
        tick(3); self.assertEqual(obs.actions, ["restart_stream"])           # grace period: no new action
        tick(3); self.assertEqual(obs.actions, ["restart_stream", "restart_stream"])
        tick(6); self.assertEqual(obs.actions[-1], "restart_obs")            # 2 stream restarts didn't help
    def test_back_live_resets(self):
        w, obs, n, tick = make(["offline"] * 3 + ["live"] * 5)
        tick(8); self.assertEqual(obs.actions, ["restart_stream"]); self.assertTrue(any("live again" in m for m in n.msgs))
    def test_obs_not_streaming(self):
        w, obs, n, tick = make(["live"] * 10); obs.stream = False
        tick(2); self.assertEqual(obs.actions, []); tick(1); self.assertEqual(obs.actions, ["start"])
    def test_obs_crashed(self):
        w, obs, n, tick = make(["live"] * 10); obs.reach = False; obs.proc = False
        tick(3); self.assertEqual(obs.actions, ["restart_obs"]); self.assertTrue(any("not running" in m for m in n.msgs))
    def test_stalled_stream(self):
        w, obs, n, tick = make(["live"] * 10)
        tick(1); obs.status = lambda: W.ObsStatus(True, True, False, 5000)   # bytes stop growing
        tick(4); self.assertIn("restart_stream", obs.actions)
    def test_obs_restart_limit(self):
        w, obs, n, tick = make(["live"] * 50)
        def down(): obs.reach = False
        for _ in range(6): down(); tick(7)
        self.assertEqual(obs.actions.count("restart_obs"), 4)               # max 4 per hour
        self.assertTrue(any("already restarted" in m for m in n.msgs))
    def test_youtube_unreachable_not_counted(self):
        cfg = W.load_config(None); obs, n = FakeObs(), Notes()
        w = W.Watchdog(cfg, obs, n, yt=lambda _: (None, None), net=lambda: True, clock=lambda: 0, sleep=lambda s: None)
        for _ in range(6): w.step()
        self.assertEqual(obs.actions, [])
    def test_parse_pages(self):
        live = '<link rel="canonical" href="https://www.youtube.com/watch?v=JtWHMOn-n-c">..."isLiveNow":true...'
        up = '<link rel="canonical" href="https://www.youtube.com/watch?v=AAAAAAAAAAA">"isUpcoming":true'
        off = '<link rel="canonical" href="https://www.youtube.com/@addis4h"> channel page'
        self.assertEqual(W.parse_live_page(live), ("live", "JtWHMOn-n-c"))
        self.assertEqual(W.parse_live_page(up)[0], "upcoming")
        self.assertEqual(W.parse_live_page(off), ("offline", None))

if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING); unittest.main(verbosity=2)
