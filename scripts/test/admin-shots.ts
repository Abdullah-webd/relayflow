// Screenshots the admin console (test admin login) and the user Report tab. Local review only.
//   SHOTS_URL=http://localhost:8791 SHOTS_OUT=dir npx tsx scripts/test/admin-shots.ts
import puppeteer from "puppeteer-core";
import { TEST_ADMIN } from "./env";
const BASE = process.env.SHOTS_URL || "http://localhost:8791";
const OUT = process.env.SHOTS_OUT || "test-results/shots";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors: string[] = [];
for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  const ctx = await browser.createBrowserContext(); // fresh cookies per viewport
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${vp.w} ${String(e)}`));
  page.on("console", (m) => m.type() === "error" && !/401/.test(m.text()) && errors.push(`${vp.w} console: ${m.text()}`));
  await page.setViewport({ width: vp.w, height: vp.h });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle0" });
  await page.screenshot({ path: `${OUT}/admin-login-${vp.w}.png` });
  await page.type("#ad-email", TEST_ADMIN.email);
  await page.type("#ad-pass", TEST_ADMIN.password);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname === "/admin/overview", { timeout: 15000 });
  for (const t of ["overview", "users", "usage", "channels", "revenue", "reports"]) {
    await page.goto(`${BASE}/admin/${t}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: `${OUT}/admin-${t}-${vp.w}.png`, fullPage: vp.w > 500 });
  }
  await page.goto(`${BASE}/admin/reports?open=demo-r1`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/admin-report-open-${vp.w}.png` });
  // The user side: Report tab.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', "demo@relayflow.test");
  await page.type('input[type="password"]', "demo-password");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 15000 });
  await page.goto(`${BASE}/app/reports`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/app-reports-${vp.w}.png`, fullPage: vp.w > 500 });
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
process.exit(0);
