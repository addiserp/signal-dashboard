# Voice-over test: makes the same lines with several open text-to-speech voices so we can pick a female one.
# Runs on GitHub's servers (they can reach the voice models); results go to the "media" branch.
import json, os, subprocess, sys, asyncio
os.makedirs("media", exist_ok=True)
lines = json.load(open("research/tts-lines.json"))
log = []

# 1) Meta MMS voices (open models, one voice per language)
try:
    import torch, scipy.io.wavfile as wf
    from transformers import VitsModel, AutoTokenizer
    for code in ["orm", "gaz", "gax", "hae", "ara"]:
        try:
            tok = AutoTokenizer.from_pretrained(f"facebook/mms-tts-{code}"); m = VitsModel.from_pretrained(f"facebook/mms-tts-{code}")
        except Exception as e:
            log.append(f"mms-{code}: not available ({str(e)[:80]})"); continue
        for L in lines:
            if (L["lang"] == "om") != (code != "ara"): continue
            text = L["text"]
            if getattr(tok, "is_uroman", False):
                import uroman as ur
                text = ur.Uroman().romanize_string(text)
            with torch.no_grad():
                out = m(**tok(text, return_tensors="pt")).waveform[0].numpy()
            wf.write(f"media/{L['id']}-mms-{code}.wav", m.config.sampling_rate, out)
            log.append(f"mms-{code}: {L['id']} ok")
except Exception as e:
    log.append(f"mms: failed {e}")

# 2) Microsoft neural voices through edge-tts (list what exists for these languages, then make the Arabic female ones)
try:
    import edge_tts
    async def run():
        vs = await edge_tts.list_voices()
        for v in vs:
            if v["Locale"].split("-")[0] in ("ar", "om", "so", "am"):
                log.append(f"edge voice: {v['ShortName']} {v['Gender']}")
        for L in lines:
            for name in L.get("edge", []):
                await edge_tts.Communicate(L["text"], name, rate=L.get("rate", "+0%")).save(f"media/{L['id']}-{name}.mp3")
                log.append(f"edge {name}: {L['id']} ok")
    asyncio.run(run())
except Exception as e:
    log.append(f"edge: failed {e}")

open("media/log.txt", "w").write("\n".join(log) + "\n")
print("\n".join(log))
