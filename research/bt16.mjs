// UI check: Test tab → Trend following → Run backtest on BTC (5 years, 4H), then read the filter card.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("snaps", { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ ...devices["Pixel 5"] });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("file://" + resolve(process.env.PAGE || "docs/index.html"));
await p.click('#views button[data-view="bt"]');
await p.waitForTimeout(1500);
await p.click('#btModes button[data-mode="trend"]');
await p.selectOption("#btPeriod", "60");
const t0 = Date.now();
await p.click("#btRun");
await p.waitForFunction(() => /done|failed|error/i.test(document.getElementById("btProg").textContent), null, { timeout: 600000 });
console.log("run took", ((Date.now() - t0) / 1000).toFixed(0), "s:", await p.textContent("#btProg"));
console.log("switches:", await p.$$eval("#dfSw label b", (x) => x.map((e) => e.textContent).join(" | ")));
// switch on Trend lines + Volume + Oscillators + Supertrend + RSI (5 filters: computed on demand)
await p.evaluate(() => localStorage.setItem("tvdash.dfMask", JSON.stringify(0)));
for (const n of [2, 4, 6, 10, 12]) { await p.click(`#dfSw input[data-b="${n - 1}"]`); await p.waitForTimeout(400); }
const rows = await p.$$eval("#dfTable tr", (x) => x.map((e) => e.innerText.replace(/\s+/g, " ")));
console.log(rows.join("\n"));
console.log("BEST:", (await p.textContent("#dfBest")).replace(/\s+/g, " "));
await p.locator("#dfCard").screenshot({ path: "snaps/df16.jpg", type: "jpeg", quality: 85 });
await b.close();
