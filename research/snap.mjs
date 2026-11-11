// Screenshots of the Live page with real Binance data (run on GitHub's servers).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("snaps", { recursive: true });
const page0 = "file://" + resolve("docs/index.html");
const shots = (process.env.SHOTS || "BTCUSDT:4h,BTCUSDT:1h,PAXGUSDT:4h,PAXGUSDT:1h,ETHUSDT:4h,SOLUSDT:4h").split(",");
const b = await chromium.launch();
for (const s of shots) {
  const [sym, tf] = s.split(":");
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(() => {
    const syms = [{ name: "BTCUSDT", market: "spot", sym: "BTCUSDT" }, { name: "ETHUSDT", market: "spot", sym: "ETHUSDT" }, { name: "GOLD", market: "spot", sym: "PAXGUSDT" }, { name: "SOLUSDT", market: "spot", sym: "SOLUSDT" }, { name: "NEARUSDT", market: "spot", sym: "NEARUSDT" }];
    localStorage.setItem("tvdash.tlSyms", JSON.stringify(syms)); localStorage.setItem("tvdash.ver", "99");
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto(`${page0}?live=1&music=0&rotate=60&tfs=${tf}&syms=${sym}`);
  await p.waitForTimeout(25000);
  const txt = async (id) => (await p.textContent(id).catch(() => "")).replace(/\s+/g, " ").trim();
  console.log(`${sym} ${tf}: price ${await txt("#lvPrice")} ${await txt("#lvChg")} | system: ${await txt("#lvSys")} | analysis: ${await txt("#lvAna")}`);
  await p.screenshot({ path: `snaps/${sym}-${tf}.jpg`, type: "jpeg", quality: 92 });
  await ctx.close();
}
await b.close();
