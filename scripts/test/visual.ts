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
    await browser.close();
    console.log(`\nvisual: ${PAGES.length * 2 - failed} passed, ${failed} failed · screenshots in ${OUT}/`);
    return failed;
  } finally {
    server.kill("SIGTERM");
  }
}
main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
