#!/usr/bin/env python3
"""Original instrumental background music for the daily Short, synthesized from code (no samples, no licensing issues).

Usage: python3 music.py MOOD SECONDS out.wav      MOOD = bull | bear | neutral
  bull    — bright major progression, 100 BPM, full drums (market up / recovery)
  bear    — dark minor progression, 78 BPM, low drone, sparse heavy kick (market down / pullback)
  neutral — soft lo-fi 7th chords, 88 BPM, light drums (sideways / mixed)
Same mood + length always gives the same track (fixed random seed).
"""
import sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
MOODS = {
    #        bpm  chords (MIDI)                                                         pad lp  arp lp  arp step  drums
    "bull":    (100, [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], 3200, 6000, 0.5, "full"),
    "bear":    (78,  [[50, 53, 57, 62], [46, 50, 53, 58], [43, 46, 50, 55], [45, 49, 52, 57]], 900,  1600, 1.0, "heavy"),
    "neutral": (88,  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], 1800, 3000, 0.5, "light"),
}

def hz(m): return 440 * 2 ** ((m - 69) / 12)
def env(n, a=0.01, r=0.3):
    t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / r)
def lp(x, fc): return sosfilt(butter(2, fc / (SR / 2), output="sos"), x)
def hp(x, fc): return sosfilt(butter(2, fc / (SR / 2), "high", output="sos"), x)

def make(mood, dur):
    bpm, prog, padlp, arplp, step_b, drums = MOODS[mood]
    rng = np.random.default_rng(11); N = int(SR * dur); out = np.zeros((N, 2))
    beat = 60 / bpm; bar = 4 * beat; intro = 2 * bar
    def add(sig, start, pan=0.0, g=1.0):
        i = int(start * SR); j = min(N, i + len(sig))
        if i >= N or j <= i: return
        s = sig[: j - i] * g; out[i:j, 0] += s * (1 - pan); out[i:j, 1] += s * (1 + pan)
    t = 0.0; k = 0
    while t < dur:
        ch = prog[k % 4]; full = t >= intro; L = int(bar * SR) + SR; tt = np.arange(L) / SR
        pad = sum(np.sin(2 * np.pi * hz(m) * tt + 0.3 * np.sin(2 * np.pi * 0.2 * tt)) + 0.3 * np.sin(4 * np.pi * hz(m) * tt) for m in ch) / len(ch)
        pe = np.minimum(1, tt / 0.6) * np.minimum(1, np.maximum(0, (bar + 0.9 - tt) / 0.9))
        add(lp(pad * pe, padlp), t, 0, 0.16)
        if mood == "bear":  # low drone
            add(lp(np.sin(2 * np.pi * hz(ch[0] - 24) * tt) * pe, 200), t, 0, 0.22)
        nb = 4 if mood == "bull" else 2
        for b in range(nb):
            n = int(bar / nb * SR); x = np.arange(n) / SR
            add(np.sin(2 * np.pi * hz(ch[0] - 12) * x) * env(n, 0.005, 0.5), t + b * bar / nb, 0, 0.26)
        step = beat * step_b; notes = ch + [ch[1] + 12]
        for a in range(int(round(bar / step))):
            m = notes[a % len(notes)] + 12; n = int(0.5 * SR); x = np.arange(n) / SR
            tone = (np.sin(2 * np.pi * hz(m) * x) + 0.4 * np.sin(2 * np.pi * 2 * hz(m) * x)) * env(n, 0.003, 0.18)
            add(lp(tone, arplp), t + a * step, 0.35 * (1 if a % 2 else -1), 0.10 if full else 0.07)
        for b in range(4):
            st = t + b * beat
            kick = (drums == "full" and full) or (drums == "heavy" and b in (0, 2)) or (drums == "light" and full and b in (0, 2)) or (not full and b == 0)
            if kick:
                n = int(0.4 * SR); x = np.arange(n) / SR; f = (42 if drums == "heavy" else 50) + 90 * np.exp(-x * 30)
                add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 8), st, 0, 0.5)
            if full and b in (1, 3) and drums != "light":
                n = int(0.25 * SR); add(hp(rng.standard_normal(n), 1500) * env(n, 0.001, 0.08), st, 0, 0.12 if drums == "full" else 0.08)
            if full and drums in ("full", "light"):
                for h in (0, 0.5):
                    n = int(0.06 * SR); add(hp(rng.standard_normal(n), 7000) * env(n, 0.001, 0.02), st + h * beat, 0.2, 0.05 if drums == "full" else 0.03)
        t += bar; k += 1
    out = np.tanh(out * 1.2); out /= np.abs(out).max() / 0.8
    fi, fo = int(SR), int(2.5 * SR)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]; out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return out

if __name__ == "__main__":
    mood, secs, path = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    if mood not in MOODS: raise SystemExit(f"mood must be one of {list(MOODS)}")
    sf.write(path, make(mood, secs), SR)
