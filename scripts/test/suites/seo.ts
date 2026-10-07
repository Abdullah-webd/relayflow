import { suite, check, api } from "../kit";

export default async function seo() {
  suite("SEO & indexing");
  const robots = await api("/robots.txt");
  check("robots.txt is real text (not the app HTML)", robots.status === 200 && /^User-agent: \*/m.test(robots.text) && robots.text.includes("Sitemap: https://userelayflow.com/sitemap.xml"));
  check("robots.txt keeps /app and /api out of search", robots.text.includes("Disallow: /app") && robots.text.includes("Disallow: /api/"));
  const sm = await api("/sitemap.xml");
  check("sitemap.xml lists the public pages", sm.status === 200 && ["/</loc>", "/pricing<", "/signup<", "/privacy<", "/terms<"].every((s) => sm.text.includes(s)) && !sm.text.includes("/login<"));

  const titles = new Set<string>();
  for (const [path, mustContain] of [["/", "AI agent"], ["/pricing", "Pricing"], ["/signup", "free trial"], ["/privacy", "Privacy"], ["/terms", "Terms"]] as const) {
    const r = await api(path);
    const title = r.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    titles.add(title);
    const canonical = r.text.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    check(`${path}: unique title, canonical, indexable`, r.status === 200 && title.includes(mustContain) && canonical === `https://userelayflow.com${path}` && r.text.includes('content="index, follow'), `${title} | ${canonical}`);
  }
  check("every public page has a different title", titles.size === 5);
  const home = await api("/");
  check("home has structured data (product, prices, FAQ)", home.text.includes('"@type":"SoftwareApplication"') && home.text.includes('"@type":"FAQPage"') && home.text.includes('"price":"15"'));
  check("social preview image tags", home.text.includes('property="og:image" content="https://userelayflow.com/og-image.png"'));

  const login = await api("/login");
  check("/login is noindex (no canonical)", login.text.includes('content="noindex, follow"') && !login.text.includes('rel="canonical"'));
  const app = await api("/app/chat");
  check("/app pages are noindex", app.status === 200 && app.text.includes("noindex"));
  const missing = await api("/this-page-does-not-exist");
  check("unknown pages return a real 404", missing.status === 404 && missing.text.includes("noindex"));
  const missingFile = await api("/nope.js");
  check("missing files 404 (not the app)", missingFile.status === 404);

  const www = await api("/pricing?x=1", { headers: { "x-forwarded-host": "www.userelayflow.com" } });
  check("www → userelayflow.com (301, keeps path)", www.status === 301 && www.headers.get("location") === "https://userelayflow.com/pricing?x=1", `${www.status} ${www.headers.get("location")}`);
  const wwwApi = await api("/api/health", { headers: { "x-forwarded-host": "www.userelayflow.com" } });
  check("API on www is NOT redirected (OAuth callbacks)", wwwApi.status === 200);
  for (const f of ["/favicon.ico", "/logo.png", "/logo-mark.png", "/og-image.png", "/site.webmanifest"]) {
    const r = await api(f);
    check(`asset ${f} served`, r.status === 200 && !String(r.headers.get("content-type")).includes("text/html"));
  }
}
