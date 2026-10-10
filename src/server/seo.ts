import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { SITE_URL, SITE_NAME, ROUTE_META, metaFor, homeStructuredData, NOT_FOUND_META, type RouteMeta } from "../shared/seo";

const CANONICAL_HOST = new URL(SITE_URL).host; // userelayflow.com
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The <head> tags Google sees for a page: unique title/description, canonical, robots, social cards. */
export function headTags(pathname: string, meta: RouteMeta): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const url = `${SITE_URL}${clean === "/" ? "/" : clean}`;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${meta.index ? "index, follow, max-image-preview:large" : "noindex, follow"}" />`,
    ...(meta.index ? [`<link rel="canonical" href="${url}" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}/og-image.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
  ];
  if (clean === "/") {
    for (const block of homeStructuredData()) {
      tags.push(`<script type="application/ld+json">${JSON.stringify(block).replace(/</g, "\\u003c")}</script>`);
    }
  }
  return tags.join("\n    ");
}

/** Replace the default head block (between the seo markers) in the built index.html. */
export function renderShell(template: string, pathname: string, meta: RouteMeta): string {
  return template.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, `<!--seo:start-->\n    ${headTags(pathname, meta)}\n    <!--seo:end-->`);
}

export function robotsTxt(): string {
  return ["User-agent: *", "Allow: /", "Disallow: /app", "Disallow: /admin", "Disallow: /api/", "", `Sitemap: ${SITE_URL}/sitemap.xml`, ""].join("\n");
}

export function sitemapXml(lastmod = new Date().toISOString().slice(0, 10)): string {
  const pages = Object.entries(ROUTE_META).filter(([, m]) => m.index).map(([p]) => p);
  const priority = (p: string) => (p === "/" ? "1.0" : p === "/pricing" || p === "/signup" ? "0.8" : "0.5");
  const urls = pages
    .map((p) => `  <url><loc>${SITE_URL}${p === "/" ? "/" : p}</loc><lastmod>${lastmod}</lastmod><priority>${priority(p)}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** One canonical host: www → apex for pages. Register BEFORE any routes. */
export function registerCanonicalHost(app: FastifyInstance): void {
  // www.userelayflow.com → userelayflow.com for pages. API, OAuth callbacks and webhooks are left
  // alone (Slack/Google/Stripe are registered against the www address).
  app.addHook("onRequest", async (req, reply) => {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0];
    const url = req.raw.url || "/";
    if (host === `www.${CANONICAL_HOST}` && (req.method === "GET" || req.method === "HEAD") && !url.startsWith("/api") && !url.startsWith("/webhooks")) {
      return reply.redirect(`${SITE_URL}${url}`, 301);
    }
  });

}

/** robots.txt, sitemap.xml, and per-page head tags with a real 404 for unknown paths. */
export function registerSeo(app: FastifyInstance, publicDir: string): void {
  app.get("/robots.txt", async (_req, reply) => reply.type("text/plain; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(robotsTxt()));
  app.get("/sitemap.xml", async (_req, reply) => reply.type("application/xml; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(sitemapXml()));

  const templatePath = path.join(publicDir, "index.html");
  let template: string | null = null;
  const shell = () => (template ??= fs.readFileSync(templatePath, "utf8"));

  // "/" gets an explicit route: the static plugin would otherwise answer it before our handler.
  app.get("/", (req, reply) => {
    reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8");
    return reply.send(renderShell(shell(), "/", metaFor("/")!));
  });

  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url || "/";
    if (url.startsWith("/api") || url.startsWith("/webhooks")) return reply.code(404).send({ error: "not_found" });
    const pathname = url.split("?")[0];
    // A request for a missing file (has an extension) is a plain 404, not the app.
    if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return reply.code(404).type("text/plain").send("Not found");
    const meta = metaFor(pathname);
    // Never cache the shell so a new build's hashed assets are always picked up.
    reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8");
    return reply.code(meta ? 200 : 404).send(renderShell(shell(), pathname, meta ?? NOT_FOUND_META));
  });
}
