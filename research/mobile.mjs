// Phone-size screenshots of the Analysis view: ticker height, chip size, and switching symbols after a pinch-zoom.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("snaps", { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
for (const page of (process.env.PAGES || "research/m40.html,research/m41.html").split(",")) {
  const tag = page.replace(/.*\//, "").replace(".html", "");
  const ctx = await b.newContext({ ...devices["Pixel 5"] });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(tag, "pageerror", e.message));
  await p.goto("file://" + resolve(page));
  await p.click('#views button[data-view="bos"]');
  await p.waitForTimeout(15000);
  const m = await p.evaluate(() => {
    const r = (q) => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().height) : null; };
    const ifr = document.querySelector("#tape iframe");
    return { tape: r("#tape"), iframe: ifr ? Math.round(ifr.getBoundingClientRect().height) : null, chip: r("#bsSyms button"), tf: r("#bsTfs button"),
             overlap: (() => { const t = document.querySelector("#tape iframe"), c = document.querySelector("#bsSyms"); return t && c ? Math.round(t.getBoundingClientRect().bottom - c.getBoundingClientRect().top) : null; })() };
  });
  console.log(tag, "sizes", JSON.stringify(m));
  await p.screenshot({ path: `snaps/${tag}-a-btc.jpg`, type: "jpeg", quality: 85 });
  // pinch-like: drag the price axis to zoom it (turns auto-scale off), then switch symbol
  const box = await p.locator("#bsChart").boundingBox();
  const ax = box.x + box.width - 20, ay = box.y + box.height / 2;
  await p.mouse.move(ax, ay); await p.mouse.down(); await p.mouse.move(ax, ay + 120, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `snaps/${tag}-b-zoomed.jpg`, type: "jpeg", quality: 85 });
  await p.locator("#bsSyms button", { hasText: "ETH" }).first().click();
  await p.waitForTimeout(10000);
  const auto = await p.evaluate(() => { try { return bsChart.priceScale("right").options().autoScale; } catch (e) { return String(e); } });
  console.log(tag, "after switch autoScale", auto);
  await p.screenshot({ path: `snaps/${tag}-c-eth.jpg`, type: "jpeg", quality: 85 });
  await ctx.close();
}
await b.close();
