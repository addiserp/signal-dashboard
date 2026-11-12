#!/usr/bin/env python3
"""Daily market Short for YouTube Shorts + TikTok (1080x1920), plus a YouTube thumbnail (1280x720) and a vertical cover.

Usage:  python3 make_short.py spec.json SNAPS_DIR OUT_DIR [--music file.mp3 --music-start 20]
  SNAPS_DIR: screenshots from the "Chart snapshots" workflow (BTCUSDT-4h.jpg, PAXGUSDT-4h.jpg, ...)
  spec.json: the day's content — see example-spec.json. Text fields are HTML (use <span class="y">…</span> for yellow,
             <b style="color:#f87171">…</b> for red, &lt; for <).
Output: <slug>-short-youtube.mp4 (music if given), <slug>-short-tiktok.mp4 (silent), <slug>-thumbnail-youtube.png,
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
mstart = float(args[args.index("--music-start") + 1]) if "--music-start" in args else 20
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
TOP = f'<div class="top"><div class="logo"><img src="logo.png">Addis-Trading</div><span class="nfa">⚠ NOT FINANCIAL ADVICE</span></div><div class="day">{spec["day"]} · {spec["date"]}</div>'
def page(inner, src=""): return f'<html><head>{CSS}</head><body>{TOP}<div class="zone">{inner}</div><div class="src">{src or ""}</div></body></html>'
def chg(s): return f'<span class="chg" style="color:{"#4ade80" if s.get("up") else "#f87171"}">{s["change"]}</span>' if s.get("change") else ""

scenes, durs = [], []
h = spec["hook"]
scenes.append(page(f'<h1>{h["title_html"]}</h1><div class="sub">{h["sub_html"]}</div><img class="shot" src="{img(h["chart"] + "-chart")}" style="margin-top:40px">')); durs.append(4)
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
    scenes.append(page(html, s.get("src"))); durs.append(s.get("seconds", 6 if t in ("asset", "news") else 5))
cta = spec.get("cta", {})
scenes.append(f'''<html><head>{CSS}</head><body>{TOP}<div style="position:absolute;left:60px;right:140px;top:470px;text-align:center">
  <img src="logo.png" style="width:240px;height:240px;border-radius:22%;box-shadow:0 30px 90px rgba(56,189,248,.35)">
  <h1 style="font-size:84px;margin-top:50px">Watch <span class="y">LIVE</span> 24/7</h1>
  <div class="sub" style="font-size:44px">{cta.get("line", "Trend lines, structure &amp; liquidity<br>drawn on every chart")}</div>
  <div style="display:inline-block;margin-top:40px;background:#229ed9;font-size:44px;font-weight:900;padding:20px 34px;border-radius:22px">📲 Telegram: t.me/addistrad</div>
  <div style="font-size:40px;font-weight:800;margin-top:36px">Charts never lie · follow for daily updates 🔔</div></div></body></html>'''); durs.append(5)

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
<div class="w"><div class="logo"><img src="logo.png">Addis-Trading Signals</div><div class="day">{spec["day"]} · {spec["date"].rsplit(" ", 1)[0]}</div>
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
<div class="w"><div class="logo"><img src="logo.png">Addis-Trading</div><div class="day">{spec["day"]} · {spec["date"].rsplit(" ", 1)[0]}</div>
<h1>{th.get("cover_title_html", th["title_html"])}</h1><div class="sub">{th.get("cover_sub_html", "")}</div></div><div class="b">{th.get("cover_line", "")}</div></body></html>'''

async def render():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for i, h in enumerate(scenes, 1):
            fn = os.path.join(work, f"s{i}.html"); open(fn, "w").write(h)
            await pg.goto("file://" + fn); await pg.wait_for_timeout(350); await pg.screenshot(path=os.path.join(work, f"s{i}.png"))
        for html, w, hh, name in [(THUMB, 1280, 720, "thumbnail-youtube"), (COVER, 1080, 1920, "cover-tiktok")]:
            fn = os.path.join(work, name + ".html"); open(fn, "w").write(html)
            q = await b.new_page(viewport={"width": w, "height": hh}); await q.goto("file://" + fn); await q.wait_for_timeout(500)
            await q.screenshot(path=os.path.join(out, f'{spec["slug"]}-{name}.png')); await q.close()
        await b.close()
asyncio.run(render())

def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
parts = []
for i, d in enumerate(durs, 1):
    n = d * 30; tmp = os.path.join(work, f"tmp_p{i}.mp4"); fin = os.path.join(work, f"p{i}.mp4")
    ff("-framerate", "30", "-i", os.path.join(work, f"s{i}.png"), "-vf",
       f"scale=2160:3840,zoompan=z='1+0.0005*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps=30,format=yuv420p,trim=duration={d},fade=t=in:st=0:d=0.3,fade=t=out:st={d - 0.3}:d=0.3",
       "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", tmp)
    os.replace(tmp, fin); parts.append(fin)
lst = os.path.join(work, "list.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
joined = os.path.join(work, "joined.mp4"); ff("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined)
total = sum(durs)
yt = os.path.join(out, f'{spec["slug"]}-short-youtube.mp4'); tt = os.path.join(out, f'{spec["slug"]}-short-tiktok.mp4')
if music:
    ff("-i", joined, "-ss", str(mstart), "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af",
       f"afade=t=in:st=0:d=1,afade=t=out:st={total - 2.5}:d=2.5,volume=0.85", "-c:a", "aac", "-b:a", "160k", "-t", str(total), yt + ".tmp.mp4")
else:
    ff("-i", joined, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", yt + ".tmp.mp4")
os.replace(yt + ".tmp.mp4", yt)
ff("-i", joined, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", tt + ".tmp.mp4")
os.replace(tt + ".tmp.mp4", tt)
ims = [Image.open(os.path.join(work, f"s{i}.png")).resize((270, 480)) for i in range(1, len(scenes) + 1)]
sheet = Image.new("RGB", (280 * len(ims), 480), (40, 40, 40))
for i, im in enumerate(ims): sheet.paste(im, (i * 280, 0))
sheet.save(os.path.join(out, f'{spec["slug"]}-sheet.png'))
print(f"done: {total}s, {len(scenes)} scenes → {out}")
