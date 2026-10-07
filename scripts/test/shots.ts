// Screenshots every dashboard page as a signed-in user (local review). Usage:
//   SHOTS_URL=http://localhost:8790 SHOTS_OUT=dir npx tsx scripts/test/shots.ts
import puppeteer from "puppeteer-core";
const BASE = process.env.SHOTS_URL || "http://localhost:8790";
const OUT = process.env.SHOTS_OUT || "test-results/shots";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pages = (process.env.SHOTS_PAGES || "overview,chat,auto-replies,auto-replies/r-shop,monitors,schedules,connections,settings").split(",");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors: string[] = [];
for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`${vp.w} ${String(e)}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${vp.w} console: ${m.text()}`));
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', "demo@relayflow.test");
  await page.type('input[type="password"]', "demo-password");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 15000 });
  for (const p of pages) {
    await page.goto(`${BASE}/app/${p}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${p.replace(/\//g, "_")}-${vp.w}.png`, fullPage: vp.w > 500 });
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
