// Live smoke test against the deployed site (read-only: no accounts, no payments, no messages).
// Usage: `npm run smoke:live` (BASE_URL defaults to https://userelayflow.com).
const BASE = process.env.BASE_URL || "https://userelayflow.com";
let failed = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}${info ? `  (${info})` : ""}`);
};
const get = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(BASE + path, { redirect: "manual", ...init });
  return { status: res.status, text: await res.text(), headers: res.headers };
};

async function main() {
  console.log(`Live smoke test · ${BASE}`);
  const health = await get("/api/health");
  check("server healthy", health.status === 200 && health.text.includes('"ok"'));
  const plans = JSON.parse((await get("/api/billing/plans")).text || "{}");
  check("plans: Starter $15, Pro $30, Stripe on", plans.plans?.map((p: any) => `${p.key}:${p.priceUsd}`).join(",") === "starter:15,pro:30" && plans.stripeEnabled === true);
  for (const [path, word] of [["/", "AI agent"], ["/pricing", "Pricing"], ["/signup", "free trial"], ["/privacy", "Privacy"], ["/terms", "Terms"]]) {
    const r = await get(path);
    const title = r.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    check(`${path} loads with its own title + canonical`, r.status === 200 && title.includes(word) && r.text.includes('rel="canonical"'), title);
  }
  const robots = await get("/robots.txt");
  check("robots.txt is real", robots.status === 200 && robots.text.startsWith("User-agent"));
  const sitemap = await get("/sitemap.xml");
  check("sitemap.xml is real", sitemap.status === 200 && sitemap.text.includes("<urlset"));
  check("unknown page returns 404", (await get("/definitely-not-a-page")).status === 404);
  const wwwRes = await fetch("https://www.userelayflow.com/pricing", { redirect: "manual" }).catch(() => null);
  if (BASE === "https://userelayflow.com") check("www redirects to userelayflow.com", wwwRes?.status === 301 && wwwRes.headers.get("location") === "https://userelayflow.com/pricing");
  check("app APIs require sign-in", (await get("/api/chats")).status === 401);
  const wh = await get("/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("Stripe webhook verifies signatures", wh.status === 400 && wh.text.includes("bad_signature"));
  const slack = await get("/api/slack/events", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("Slack events reject unsigned requests", slack.status === 401);
  for (const f of ["/logo.png", "/favicon.ico", "/og-image.png"]) check(`asset ${f}`, (await get(f)).status === 200);
  console.log(`\nlive: ${failed ? `${failed} FAILED` : "all passed"}`);
}
main().then(() => process.exit(failed ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
