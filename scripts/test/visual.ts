// Visual smoke test: renders key pages in real Chrome at desktop + phone widths and checks for
// layout breakage, missing logo, JS errors. Screenshots → test-results/visual/ for a human look.
// Usage: `npm run test:visual` (needs a built app: `npm run build`). Set CHROME_PATH if needed.
import { API } from "./env";
import fs from "node:fs";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser"].find((p) => fs.existsSync(p));
const OUT = "test-results/visual";
const PAGES: [string, RegExp][] = [
  ["/", /Every business chat/],
  ["/pricing", /Starter|plans/i],
  ["/signup", /Create your workspace/],
  ["/login", /Welcome back|Sign in/],
  ["/privacy", /Privacy Policy/],
  ["/terms", /Terms of Service/],
  ["/does-not-exist", /doesn.t exist/],
];

async function main() {
  if (!CHROME) {
    console.log("No Chrome found — skipping visual tests (set CHROME_PATH).");
    return 0;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn("npx", ["tsx", "src/server/index.ts"], { env: process.env, stdio: "ignore" });
  try {
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    let failed = 0;
    for (const [path, expect] of PAGES) {
      for (const [w, h] of [[1440, 900], [375, 812]] as const) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
        await page.goto(API + path, { waitUntil: "networkidle0", timeout: 30000 });
        await new Promise((r) => setTimeout(r, 1200));
        await page.evaluate(() => document.querySelectorAll(".rf-reveal").forEach((e) => e.classList.add("is-in")));
        const info = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          text: document.body.innerText,
          logos: [...document.querySelectorAll('img[alt="RelayFlow"]')].map((i) => (i as HTMLImageElement).naturalWidth),
        }));
        const problems = [
          info.overflow > 0 && `scrolls sideways by ${info.overflow}px`,
          !expect.test(info.text) && `missing expected text ${expect}`,
          (info.logos.length === 0 || info.logos.some((n) => n === 0)) && "logo missing or broken",
          errors.length > 0 && `JS errors: ${errors.join("; ").slice(0, 160)}`,
        ].filter(Boolean);
        const name = `${path === "/" ? "home" : path.slice(1).replace(/\//g, "_")}-${w}`;
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: w > 600 ? false : false });
        console.log(`  ${problems.length ? "✗ FAIL" : "✓"}  ${path} @${w}px${problems.length ? `  (${problems.join(", ")})` : ""}`);
        if (problems.length) failed++;
        await page.close();
      }
    }
    failed += await appChecks(browser);
    await browser.close();
    console.log(`\nvisual: ${failed ? `${failed} FAILED` : "all passed"} · screenshots in ${OUT}/`);
    return failed;
  } finally {
    server.kill("SIGTERM");
  }
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });

// ---- Signed-in dashboard: motion + instant tab return ----
async function appChecks(browser: import("puppeteer-core").Browser): Promise<number> {
  const { connectDb, users, chats } = await import("../../src/server/db");
  const { createSession } = await import("../../src/server/auth/session");
  await connectDb();
  const id = `visual-${Date.now()}`;
  await users().insertOne({ _id: id, email: `${id}@example.invalid`, passwordHash: "x", emailVerified: true, timezone: "UTC", subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(Date.now() + 864e5), createdAt: new Date(), updatedAt: new Date() } as any);
  const now = Date.now();
  await chats().insertMany(["Morning check-in", "Wholesale buyers follow-up", "Support summary"].map((title, i) => ({ _id: `${id}-c${i}`, userId: id, title, createdAt: new Date(now - i * 1000), updatedAt: new Date(now - i * 1000) })) as any);
  const token = await createSession(id);
  let failed = 0;
  const check = (name: string, ok: boolean, info = "") => {
    if (!ok) failed++;
    console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}${info ? `  (${info})` : ""}`);
  };
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie({ name: "rf_session", value: token, domain: "localhost", path: "/" });
  await page.goto(`${API}/app/chat`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const rows = () => page.evaluate(() => [...document.querySelectorAll("div")].filter((d) => d.textContent === "Morning check-in" || d.textContent?.startsWith("Wholesale buyers")).length);
  check("dashboard: chat list renders", (await rows()) > 0);
  await page.screenshot({ path: `${OUT}/app-chat-1440.png` });

  // Switch tab: the page should animate in (mid-transition opacity < 1, then settle at 1).
  const opacityAfter = async (ms: number) => {
    await new Promise((r) => setTimeout(r, ms));
    return page.evaluate(() => Number(getComputedStyle(document.querySelector("main > div") as Element).opacity));
  };
  await page.click('a[href="/app/connections"]');
  const mid = await opacityAfter(40);
  const end = await opacityAfter(500);
  check("tab switch animates (fades/lifts in)", mid < 1 && end === 1, `opacity ${mid.toFixed(2)} → ${end}`);
  const pillInConnections = await page.evaluate(() => {
    const link = document.querySelector('nav a[href="/app/connections"]');
    return Boolean(link && link.querySelector("span.absolute"));
  });
  check("sidebar highlight moved to the new tab", pillInConnections);
  await page.screenshot({ path: `${OUT}/app-connections-1440.png` });

  // Back to Chat: the list must be there immediately (from cache), not blank-then-pop.
  await page.click('a[href="/app/chat"]');
  await new Promise((r) => setTimeout(r, 60));
  const instant = await rows();
  check("returning to Chat shows the list instantly", instant > 0, `${instant} rows after 60ms`);
  check("dashboard: no JavaScript errors", errors.length === 0, errors.join("; ").slice(0, 160));
  await page.close();

  await chats().deleteMany({ userId: id });
  await users().deleteOne({ _id: id });
  return failed;
}
