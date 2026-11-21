#!/usr/bin/env python3
"""Daily market Short for YouTube Shorts + TikTok (1080x1920), plus a YouTube thumbnail (1280x720) and a vertical cover.

Usage:  python3 make_short.py spec.json SNAPS_DIR OUT_DIR [--voice] [--music file.mp3 --music-start 8]
  --voice: female voiceover (Kokoro TTS, voice "af_heart" pitched ~7% lower) from the "say" text of the hook, each scene
           and the platform CTA; each scene lasts as long as its line. Model files download to ~/.cache/kokoro once.
  --music: background track under the voice (ducked), on BOTH videos.
  SNAPS_DIR: screenshots from the "Chart snapshots" workflow (BTCUSDT-4h.jpg, PAXGUSDT-4h.jpg, ...)
  spec.json: the day's content — see example-spec.json. Text fields are HTML (use <span class="y">…</span> for yellow,
             <b style="color:#f87171">…</b> for red, &lt; for <).
Output: <slug>-short-youtube.mp4 (ends with SUBSCRIBE), <slug>-short-tiktok.mp4 (ends with FOLLOW), <slug>-thumbnail-youtube.png,
        <slug>-cover-tiktok.png, and <slug>-sheet.png (all scenes side by side, for checking).
Needs: python3 + playwright (pip) with Chromium, Pillow, ffmpeg.
"""
import asyncio, json, os, shutil, subprocess, sys
from PIL import Image
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
spec = json.load(open(args[0])); snaps = os.path.abspath(args[1]); out = os.path.abspath(args[2])
music = args[args.index("--music") + 1] if "--music" in args else None
mstart = float(args[args.index("--music-start") + 1]) if "--music-start" in args else 8
voice = "--voice" in args
work = os.path.join(out, "_work"); os.makedirs(work, exist_ok=True)
for f in ("common.css", "logo.png"): shutil.copy(os.path.join(HERE, f), work)

# ---- crops from the Live-page screenshots (1920x1080) ----
def crops(name):
    src = os.path.join(snaps, name + ".jpg")
    if not os.path.exists(src): raise SystemExit(f"missing screenshot {src}")
    im = Image.open(src)
    im.crop((535, 95, 1910, 1000)).save(os.path.join(work, f"{name}-chart.png"))
    im.crop((10, 95, 525, 340)).save(os.path.join(work, f"{name}-dxy.png"))
    im.crop((10, 350, 525, 530)).save(os.path.join(work, f"{name}-sys.png"))
for f in sorted(os.listdir(snaps)):
    if f.endswith(".jpg"): crops(f[:-4])
img = lambda key: f"{key}.png"   # e.g. "BTCUSDT-4h-chart", "BTCUSDT-4h-dxy", "BTCUSDT-4h-sys"

CSS = '''<link rel="stylesheet" href="common.css"><style>
body{width:1080px;height:1920px;position:relative;background:radial-gradient(120% 70% at 50% 25%,#13233d 0%,#070b12 62%)}
.top{position:absolute;left:60px;right:140px;top:200px;display:flex;justify-content:space-between;align-items:center}
.top .logo{font-size:40px}.top .logo img{width:76px;height:76px}
.day{position:absolute;left:60px;top:300px;font-size:38px;font-weight:900;letter-spacing:.12em;color:#38bdf8}
.zone{position:absolute;left:60px;right:140px;top:360px}
.shot{border:3px solid #263247;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.7);display:block;width:100%}
h1{font-size:98px;font-weight:900;line-height:1.04;letter-spacing:-.01em}
.sub{font-size:47px;font-weight:700;color:#cbd5e1;line-height:1.3;margin-top:22px}
.pill{display:inline-block;font-size:36px;font-weight:900;padding:8px 18px;border-radius:12px;margin:6px 8px 0 0}
.news{background:#7c3aed}.red{background:#b91c1c}.grn{background:#15803d}.amb{background:#b45309}.blu{background:#1d4ed8}
.lv{display:flex;gap:14px;flex-wrap:wrap;margin-top:22px}
.lv span{font-size:38px;font-weight:800;padding:8px 16px;border-radius:12px;background:#111a2a;border:2px solid #2a3a55}
.src{position:absolute;left:60px;right:140px;top:1440px;font-size:24px;color:#64748b}
.nfa{font-size:28px}.chg{font-size:64px}
</style>'''
TOP = f'<div class="top"><div class="logo"><img src="logo.png">Addis Chart</div><span class="nfa">⚠ NOT FINANCIAL ADVICE</span></div><div class="day">{spec["day"]} · {spec["date"]}</div>'
def page(inner, src=""): return f'<html><head>{CSS}</head><body>{TOP}<div class="zone">{inner}</div><div class="src">{src or ""}</div></body></html>'
def chg(s): return f'<span class="chg" style="color:{"#4ade80" if s.get("up") else "#f87171"}">{s["change"]}</span>' if s.get("change") else ""

SPLASH_D = 0.8
SPLASH_COL = {"amb": "#f59e0b", "red": "#ef4444", "grn": "#22c55e", "blu": "#3b82f6", "news": "#8b5cf6"}
def splash_page(icon, label, price, cls):
    c = SPLASH_COL.get(cls, "#38bdf8")
    rays = "".join(f'<i style="transform:rotate({k * 15}deg)"></i>' for k in range(24))
    return f'''<html><head>{CSS}<style>
body{{background:radial-gradient(60% 40% at 50% 46%,{c}55 0%,#070b12 70%)}}
.rays{{position:absolute;left:540px;top:880px;width:0;height:0;animation:spin {SPLASH_D}s linear both}}
.rays i{{position:absolute;left:-7px;top:-900px;width:14px;height:900px;transform-origin:7px 900px;background:linear-gradient(0deg,{c}00,{c}66 40%,{c}00)}}
.ring{{position:absolute;left:540px;top:880px;width:10px;height:10px;margin:-5px;border-radius:50%;border:10px solid {c};animation:ring {SPLASH_D}s ease-out both}}
.badge{{position:absolute;left:540px;top:880px;width:400px;height:400px;margin:-200px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#ffffff33,{c} 45%,#0b1220 100%);border:10px solid #fff;box-shadow:0 0 120px {c},0 30px 80px #000;
  display:flex;align-items:center;justify-content:center;font-size:210px;font-weight:900;color:#fff;animation:pop {SPLASH_D}s cubic-bezier(.2,1.4,.4,1) both}}
.lbl{{position:absolute;left:0;right:0;top:1130px;text-align:center;font-size:110px;font-weight:900;letter-spacing:.04em;animation:up {SPLASH_D}s ease-out both}}
.pr{{position:absolute;left:0;right:0;top:1270px;text-align:center;font-size:72px;font-weight:900;color:#facc15;animation:up {SPLASH_D}s ease-out both}}
@keyframes spin{{from{{transform:rotate(0) scale(.6);opacity:0}}20%{{opacity:1}}to{{transform:rotate(40deg) scale(1.1);opacity:.9}}}}
@keyframes ring{{0%{{width:10px;height:10px;margin:-15px;opacity:1}}70%{{opacity:.6}}100%{{width:1300px;height:1300px;margin:-660px;opacity:0}}}}
@keyframes pop{{0%{{transform:scale(0) rotate(-25deg)}}45%{{transform:scale(1.15) rotate(6deg)}}70%{{transform:scale(.97) rotate(0)}}100%{{transform:scale(1)}}}}
@keyframes up{{0%,25%{{transform:translateY(60px);opacity:0}}55%,100%{{transform:none;opacity:1}}}}
</style></head><body>{TOP}<div class="rays">{rays}</div><div class="ring"></div><div class="badge">{icon}</div>
<div class="lbl">{label}</div><div class="pr">{price}</div></body></html>'''

# subscribe / follow reminder popup (transparent overlay, 1080x460 band at y=OV_Y)
OV_Y, OV_D = 1150, 3.6
POP = {"youtube": ("#ff0033", "SUBSCRIBE", "SUBSCRIBED", "🔔"), "tiktok": ("#fe2c55", "Follow", "Following ✓", "❤️")}
def popup_page(plat):
    col, b1, b2, ic = POP[plat]
    pc = lambda t: f"{t / OV_D * 100:.1f}%"
    return f'''<html><head><link rel="stylesheet" href="common.css"><style>
html,body{{background:transparent!important;width:1080px;height:1920px;margin:0}}
.card{{position:absolute;left:90px;top:{OV_Y + 80}px;width:900px;height:170px;border-radius:30px;background:#fff;box-shadow:0 25px 70px rgba(0,0,0,.6);
  display:flex;align-items:center;gap:22px;padding:0 28px;box-sizing:border-box;animation:card {OV_D}s both}}
.card img{{width:110px;height:110px;border-radius:50%}}
.nm{{flex:1;color:#0f0f0f;font-size:35px;font-weight:900;line-height:1.1;white-space:nowrap}}.nm small{{display:block;color:#606060;font-size:27px;font-weight:700;margin-top:6px}}
.btn{{position:relative;width:250px;height:84px}}
.btn b{{position:absolute;inset:0;border-radius:42px;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:900}}
.b1{{background:{col};color:#fff;animation:b1 {OV_D}s both}}.b2{{background:#e5e5e5;color:#0f0f0f;animation:b2 {OV_D}s both}}
.ic{{font-size:66px;width:80px;text-align:center;transform-origin:50% 15%;animation:ic {OV_D}s both}}
.cur{{position:absolute;left:0;top:0;width:78px;height:78px;animation:cur {OV_D}s both;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}}
@keyframes card{{0%{{transform:translateY(90px) scale(.9);opacity:0}}{pc(.35)}{{transform:none;opacity:1}}{pc(3.15)}{{transform:none;opacity:1}}100%{{transform:translateY(60px);opacity:0}}}}
@keyframes b1{{0%,{pc(1.15)}{{transform:scale(1);opacity:1}}{pc(1.22)}{{transform:scale(.9);opacity:1}}{pc(1.27)},100%{{transform:scale(.9);opacity:0}}}}
@keyframes b2{{0%,{pc(1.25)}{{opacity:0;transform:scale(.9)}}{pc(1.35)}{{opacity:1;transform:scale(1.05)}}{pc(1.45)},100%{{opacity:1;transform:scale(1)}}}}
@keyframes ic{{0%,{pc(1.95)}{{transform:rotate(0) scale(1)}}{pc(2.05)}{{transform:rotate(22deg) scale(1.25)}}{pc(2.2)}{{transform:rotate(-20deg) scale(1.25)}}{pc(2.35)}{{transform:rotate(16deg) scale(1.2)}}{pc(2.5)}{{transform:rotate(-12deg) scale(1.15)}}{pc(2.65)}{{transform:rotate(6deg) scale(1.1)}}{pc(2.8)},100%{{transform:rotate(0) scale(1)}}}}
@keyframes cur{{0%,{pc(0.4)}{{transform:translate(1000px,{OV_Y + 420}px);opacity:0}}{pc(0.55)}{{opacity:1}}
  {pc(1.1)}{{transform:translate(760px,{OV_Y + 175}px) scale(1)}}{pc(1.2)}{{transform:translate(760px,{OV_Y + 175}px) scale(.8)}}{pc(1.3)}{{transform:translate(760px,{OV_Y + 175}px) scale(1)}}
  {pc(1.85)}{{transform:translate(935px,{OV_Y + 175}px) scale(1)}}{pc(1.95)}{{transform:translate(935px,{OV_Y + 175}px) scale(.8)}}{pc(2.05)}{{transform:translate(935px,{OV_Y + 175}px) scale(1)}}
  {pc(2.7)}{{transform:translate(1000px,{OV_Y + 330}px);opacity:1}}{pc(2.9)},100%{{transform:translate(1040px,{OV_Y + 400}px);opacity:0}}}}
</style></head><body><div class="card"><img src="logo.png"><div class="nm">Addis Chart Signals<small>Daily chart updates</small></div>
<div class="btn"><b class="b1">{b1}</b><b class="b2">{b2}</b></div><div class="ic">{ic}</div></div>
<svg class="cur" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5 4 7.5-3 1.5-4-7.5L4 20z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>
</body></html>'''
POP_SFX = [(1.2, "click"), (2.0, "click"), (2.05, "ding")]   # seconds into the popup

scenes, durs, says, kinds, splashes = [], [], [], [], {}
h = spec["hook"]
scenes.append(page(f'<h1>{h["title_html"]}</h1><div class="sub">{h["sub_html"]}</div><img class="shot" src="{img(h["chart"] + "-chart")}" style="margin-top:40px">')); durs.append(h.get("seconds", 4)); says.append(h.get("say", "")); kinds.append("hook")
for s in spec["scenes"]:
    pill = f'<span class="pill {s.get("pill_class", "news")}">{s["pill"]}</span>'
    t = s["type"]
    if t == "asset":
        lv = "".join(f"<span>{x}</span>" for x in s.get("levels", []))
        html = f'{pill}<h1 style="margin-top:20px"><span class="y">{s["price"]}</span> {chg(s)}</h1><div class="sub">{s["sub_html"]}</div><img class="shot" src="{img(s["chart"] + "-chart")}" style="margin-top:28px">' + (f'<div class="lv">{lv}</div>' if lv else "")
    elif t == "news":
        pic = f'<div style="margin-top:36px;font-size:36px;font-weight:800;color:#94a3b8">{s.get("image_caption", "")}</div><img class="shot" src="{img(s["image"])}" style="margin-top:14px">' if s.get("image") else ""
        html = f'{pill}<h1 style="margin-top:20px">{s["title_html"]}</h1><div class="sub">{s["sub_html"]}</div>{pic}'
    elif t == "system":
        html = f'{pill}<h1 style="margin-top:20px">{s["title_html"]}</h1><img class="shot" src="{img(s["image"])}" style="margin-top:30px"><div class="sub">{s["sub_html"]}</div>'
    else:  # text
        html = f'{pill}<h1 style="margin-top:20px">{s["title_html"]}</h1><div class="sub" style="font-size:50px;line-height:1.45">{s["body_html"]}</div>'
    if t == "asset" and spec.get("splash", True):   # coin-change splash: badge pops before each coin scene
        icon, _, label = s["pill"].partition(" ")
        b = s.get("badge", {})
        splashes[len(scenes)] = splash_page(b.get("icon", icon), b.get("label", label or icon), f'{s["price"]} {chg(s)}', s.get("pill_class", "news"))
    scenes.append(page(html, s.get("src"))); durs.append(s.get("seconds", 6 if t in ("asset", "news") else 5)); says.append(s.get("say", "")); kinds.append(t)
cta = spec.get("cta", {})
CTA_BTN = {"youtube": ('#ff0033', '▶ SUBSCRIBE', 'Subscribe'), "tiktok": ('#fe2c55', '➕ FOLLOW', 'Follow')}
def cta_page(plat):
    col, btn, verb = CTA_BTN[plat]
    return f'''<html><head>{CSS}</head><body>{TOP}<div style="position:absolute;left:60px;right:140px;top:470px;text-align:center">
  <img src="logo.png" style="width:240px;height:240px;border-radius:22%;box-shadow:0 30px 90px rgba(56,189,248,.35)">
  <h1 style="font-size:84px;margin-top:50px">Daily <span class="y">chart</span> updates</h1>
  <div class="sub" style="font-size:44px">{cta.get("line", "Trend lines, structure &amp; liquidity<br>drawn on every chart")}</div>
  <div style="display:inline-block;margin-top:44px;background:{col};font-size:64px;font-weight:900;padding:22px 56px;border-radius:26px;box-shadow:0 20px 60px rgba(0,0,0,.5)">{btn}</div>
  <div style="font-size:40px;font-weight:800;margin-top:40px">{verb} for tomorrow's update 🔔<br><span style="color:#94a3b8">Charts never lie</span></div></div></body></html>'''
CTA_SAY = {p: cta.get("say_" + p, f"{CTA_BTN[p][2]} for daily chart updates. Charts never lie. Not financial advice.") for p in CTA_BTN}
cta_durs = {p: cta.get("seconds", 5) for p in CTA_BTN}

th = spec["thumb"]
THUMB = f'''<html><head><link rel="stylesheet" href="common.css"><style>
body{{width:1280px;height:720px;position:relative}}
.c1{{position:absolute;right:0;top:0;width:700px;height:420px;background:url({img(th["chart_top"] + "-chart")}) center/cover;filter:saturate(1.3) contrast(1.1)}}
.c2{{position:absolute;right:0;bottom:0;width:700px;height:300px;background:url({img(th["chart_bottom"] + "-chart")}) 30% 40%/cover;filter:saturate(1.3) contrast(1.1)}}
.fade{{position:absolute;inset:0;background:linear-gradient(90deg,#070b12 0%,#070b12 44%,rgba(7,11,18,.6) 56%,rgba(7,11,18,0) 70%)}}
.t1,.t2{{position:absolute;right:20px;font-weight:900;font-size:30px;padding:8px 16px;border-radius:12px}}.t1{{top:20px}}.t2{{top:440px}}
.red{{background:#b91c1c}}.amb{{background:#b45309}}.grn{{background:#15803d}}.blu{{background:#1d4ed8}}
.w{{position:absolute;left:50px;top:40px;width:640px}}.logo{{font-size:28px}}.logo img{{width:58px;height:58px}}
.day{{margin-top:26px;font-size:30px;font-weight:900;letter-spacing:.12em;color:#38bdf8}}
h1{{font-size:96px;line-height:.95;font-weight:900;margin-top:10px;white-space:nowrap}}
.sub{{margin-top:22px;font-size:40px;font-weight:900;line-height:1.15}}.nfa{{display:inline-block;margin-top:24px;font-size:22px;padding:6px 14px}}
</style></head><body><div class="c1"></div><div class="c2"></div><div class="fade"></div>
<div class="t1 {th.get("tag_top_class", "amb")}">{th["tag_top"]}</div><div class="t2 {th.get("tag_bottom_class", "red")}">{th["tag_bottom"]}</div>
<div class="w"><div class="logo"><img src="logo.png">Addis Chart Signals</div><div class="day">{spec["day"]} · {spec["date"].rsplit(" ", 1)[0]}</div>
<h1>{th["title_html"]}</h1><div class="sub">{th["sub_html"]}</div><span class="nfa">⚠ NOT FINANCIAL ADVICE</span></div></body></html>'''
COVER = f'''<html><head><link rel="stylesheet" href="common.css"><style>
body{{width:1080px;height:1920px;position:relative;background:#070b12}}
.bg{{position:absolute;left:0;right:0;top:760px;height:760px;background:url({img(th["chart_top"] + "-chart")}) 60% 50%/cover;filter:saturate(1.3) contrast(1.1)}}
.g{{position:absolute;inset:0;background:linear-gradient(180deg,#070b12 0%,#070b12 38%,rgba(7,11,18,.1) 50%,rgba(7,11,18,.1) 74%,#070b12 82%)}}
.w{{position:absolute;left:60px;right:140px;top:230px}}.logo{{font-size:40px}}.logo img{{width:80px;height:80px}}
.day{{margin-top:30px;font-size:42px;font-weight:900;letter-spacing:.12em;color:#38bdf8}}
h1{{font-size:150px;line-height:.92;font-weight:900;margin-top:16px}}.sub{{font-size:58px;font-weight:900;margin-top:24px;line-height:1.15}}
.b{{position:absolute;left:60px;top:1540px;right:140px;font-size:46px;font-weight:900;line-height:1.4}}
</style></head><body><div class="bg"></div><div class="g"></div>
<div class="w"><div class="logo"><img src="logo.png">Addis Chart</div><div class="day">{spec["day"]} · {spec["date"].rsplit(" ", 1)[0]}</div>
<h1>{th.get("cover_title_html", th["title_html"])}</h1><div class="sub">{th.get("cover_sub_html", "")}</div></div><div class="b">{th.get("cover_line", "")}</div></body></html>'''

popup_on = spec.get("subscribe_popup", True)
POPUP_AT = next((i for i, k in enumerate(kinds) if k == "text"), min(4, len(kinds) - 1)) if popup_on else None
async def render():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for i, h in enumerate(scenes, 1):
            fn = os.path.join(work, f"s{i}.html"); open(fn, "w").write(h)
            await pg.goto("file://" + fn); await pg.wait_for_timeout(350); await pg.screenshot(path=os.path.join(work, f"s{i}.png"))
        for plat in CTA_BTN:
            fn = os.path.join(work, f"cta-{plat}.html"); open(fn, "w").write(cta_page(plat))
            await pg.goto("file://" + fn); await pg.wait_for_timeout(350); await pg.screenshot(path=os.path.join(work, f"cta-{plat}.png"))
        async def anim(html, dur, prefix, clip=None):
            fn = os.path.join(work, prefix + ".html"); open(fn, "w").write(html)
            await pg.goto("file://" + fn); await pg.wait_for_timeout(300)
            for f in range(int(round(dur * 30))):
                await pg.evaluate(f"document.getAnimations().forEach(a => {{a.pause(); a.currentTime = {f * 1000 / 30};}})")
                await pg.screenshot(path=os.path.join(work, f"{prefix}_{f:03d}.png"), clip=clip, omit_background=clip is not None)
        for i, html in splashes.items(): await anim(html, SPLASH_D, f"splash{i}")
        if POPUP_AT is not None:
            for plat in POP: await anim(popup_page(plat), OV_D, f"pop-{plat}", {"x": 0, "y": OV_Y, "width": 1080, "height": 460})
        for html, w, hh, name in [(THUMB, 1280, 720, "thumbnail-youtube"), (COVER, 1080, 1920, "cover-tiktok")]:
            fn = os.path.join(work, name + ".html"); open(fn, "w").write(html)
            q = await b.new_page(viewport={"width": w, "height": hh}); await q.goto("file://" + fn); await q.wait_for_timeout(500)
            await q.screenshot(path=os.path.join(out, f'{spec["slug"]}-{name}.png')); await q.close()
        await b.close()
asyncio.run(render())

def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)

# ---- voiceover: one clip per scene; a scene lasts at least as long as its line ----
def tts_clips():
    from kokoro_onnx import Kokoro
    import soundfile as sf, urllib.request
    cache = os.path.expanduser("~/.cache/kokoro"); os.makedirs(cache, exist_ok=True)
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not os.path.exists(os.path.join(cache, f)): urllib.request.urlretrieve(base + f, os.path.join(cache, f))
    k = Kokoro(os.path.join(cache, "kokoro-v1.0.onnx"), os.path.join(cache, "voices-v1.0.bin"))
    def clip(text, name):
        if not text: return None, 0
        a, sr = k.create(text, voice="af_heart", speed=1.1, lang="en-us"); raw = os.path.join(work, name + "_raw.wav")
        sf.write(raw, a, sr); fn = os.path.join(work, name + ".wav")
        ff("-i", raw, "-af", f"asetrate={sr}*0.93,aresample=44100,atempo={1/0.93:.4f},aformat=channel_layouts=stereo", fn)
        return fn, len(a) / sr
    return clip
clips, cta_clips = [None] * len(durs), {}
if voice:
    clip = tts_clips()
    for i, t in enumerate(says):
        clips[i], L = clip(t, f"vo{i}")
        if L: durs[i] = max(durs[i], round(L + 0.9, 1))
    for p in CTA_BTN:
        cta_clips[p], L = clip(CTA_SAY[p], f"vo-cta-{p}")
        if L: cta_durs[p] = max(cta_durs[p], round(L + 1.2, 1))

def seg(png, d, fin):
    n = int(round(d * 30)); tmp = fin + ".tmp.mp4"
    ff("-framerate", "30", "-i", png, "-vf",
       f"scale=2160:3840,zoompan=z='1+0.0005*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps=30,format=yuv420p,trim=duration={d},fade=t=in:st=0:d=0.3,fade=t=out:st={d - 0.3}:d=0.3",
       "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", tmp)
    os.replace(tmp, fin); return fin
parts = [seg(os.path.join(work, f"s{i}.png"), d, os.path.join(work, f"p{i}.mp4")) for i, d in enumerate(durs, 1)]
def anim_seg(prefix, fin):
    ff("-framerate", "30", "-i", os.path.join(work, prefix + "_%03d.png"), "-vf", "format=yuv420p",
       "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", fin); return fin
splash_parts = {i: anim_seg(f"splash{i}", os.path.join(work, f"splash{i}.mp4")) for i in splashes}
SFX = {"whoosh": "anoisesrc=d=0.6:c=pink:a=0.5,highpass=f=400,lowpass=f=5000,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.35,volume=0.5",
       "click": "sine=f=1800:d=0.04,afade=t=out:st=0.01:d=0.03,volume=0.6",
       "ding": "sine=f=1318:d=0.9,afade=t=out:st=0.02:d=0.88,volume=0.35"}
for k, v in SFX.items(): ff("-f", "lavfi", "-i", v, "-ar", "44100", "-ac", "2", os.path.join(work, f"sfx-{k}.wav"))

def build(plat, dest):
    allp, allc, alld, events, t, pop_t = [], [], [], [], 0.0, None
    for i in range(len(parts)):
        if i in splash_parts:
            allp.append(splash_parts[i]); allc.append(None); alld.append(SPLASH_D); events.append((t, os.path.join(work, "sfx-whoosh.wav"))); t += SPLASH_D
        if i == POPUP_AT: pop_t = t + 0.8
        allp.append(parts[i]); allc.append(clips[i]); alld.append(durs[i]); t += durs[i]
    allp.append(seg(os.path.join(work, f"cta-{plat}.png"), cta_durs[plat], os.path.join(work, f"p-cta-{plat}.mp4")))
    allc.append(cta_clips.get(plat)); alld.append(cta_durs[plat]); total = round(sum(alld), 2)
    if pop_t is not None: events += [(pop_t + dt, os.path.join(work, f"sfx-{k}.wav")) for dt, k in POP_SFX]
    lst = os.path.join(work, f"list-{plat}.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in allp))
    joined = os.path.join(work, f"joined-{plat}.mp4"); ff("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined)
    if pop_t is not None:
        ov = os.path.join(work, f"joined-ov-{plat}.mp4")
        ff("-i", joined, "-framerate", "30", "-i", os.path.join(work, f"pop-{plat}_%03d.png"), "-filter_complex",
           f"[1:v]format=rgba,setpts=PTS-STARTPTS+{pop_t}/TB[o];[0:v][o]overlay=0:{OV_Y}:eof_action=pass:format=auto,format=yuv420p[v]",
           "-map", "[v]", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-r", "30", ov); joined = ov
    inp, flt, mixin, k = ["-i", joined], [], [], 1
    for i, c in enumerate(allc):
        if not c: continue
        ms = int((sum(alld[:i]) + 0.35) * 1000); inp += ["-i", c]
        flt.append(f"[{k}:a]adelay={ms}|{ms}[v{k}]"); mixin.append(f"[v{k}]"); k += 1
    sfx = []
    for et, f in events:
        ms = int(et * 1000); inp += ["-i", f]; flt.append(f"[{k}:a]adelay={ms}|{ms}[x{k}]"); sfx.append(f"[x{k}]"); k += 1
    if mixin:
        flt.append("".join(mixin) + f"amix=inputs={len(mixin)}:normalize=0,apad,atrim=0:{total},equalizer=f=180:t=q:w=1:g=2,acompressor=threshold=-18dB:ratio=3,volume=1.6[vo]")
    if music:
        inp += ["-ss", str(mstart), "-i", music]
        flt.append(f"[{k}:a]atrim=0:{total},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=stereo,volume={0.16 if mixin else 0.85},afade=t=in:st=0:d=1,afade=t=out:st={total - 2.5}:d=2.5[m]"); k += 1
        if mixin: flt.append("[vo]asplit[v][sc];[m][sc]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=500[md];[v][md]amix=inputs=2:normalize=0,volume=2.2,alimiter=limit=0.89[a0]")
        else: flt.append("[m]anull[a0]")
    elif mixin: flt.append("[vo]volume=1.4,alimiter=limit=0.89[a0]")
    else:
        inp += ["-f", "lavfi", "-t", str(total), "-i", "anullsrc=r=44100:cl=stereo"]; flt.append(f"[{k}:a]anull[a0]"); k += 1
    if sfx: flt.append("[a0]" + "".join(sfx) + f"amix=inputs={len(sfx) + 1}:normalize=0:duration=first,alimiter=limit=0.89[a]")
    else: flt.append("[a0]anull[a]")
    tmp = dest + ".tmp.mp4"
    ff(*inp, "-filter_complex", ";".join(flt), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", str(total), tmp)
    os.replace(tmp, dest); return total
total = build("youtube", os.path.join(out, f'{spec["slug"]}-short-youtube.mp4'))
build("tiktok", os.path.join(out, f'{spec["slug"]}-short-tiktok.mp4'))
ims = [Image.open(os.path.join(work, f"s{i}.png")).resize((270, 480)) for i in range(1, len(scenes) + 1)] + [Image.open(os.path.join(work, f"cta-{p}.png")).resize((270, 480)) for p in CTA_BTN]
sheet = Image.new("RGB", (280 * len(ims), 480), (40, 40, 40))
for i, im in enumerate(ims): sheet.paste(im, (i * 280, 0))
sheet.save(os.path.join(out, f'{spec["slug"]}-sheet.png'))
print(f"done: {total}s, {len(scenes)} scenes, voice={'on' if voice else 'off'}, music={'on' if music else 'off'} → {out}")
