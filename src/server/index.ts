import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import { env } from "./env";
import { registerSeo, registerCanonicalHost } from "./seo";
import { connectDb } from "./db";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { connectionRoutes } from "./routes/connections";
import { taskRoutes } from "./routes/tasks";
import { monitorRoutes } from "./routes/monitors";
import { autoReplyRoutes } from "./routes/autoReplies";
import { overviewRoutes } from "./routes/overview";
import { reportRoutes } from "./routes/reports";
import { adminRoutes } from "./routes/admin";
import { billingRoutes, stripeWebhookHandler } from "./routes/billing";
import { resumeConnections, stopConnections } from "./connectors/manager";
import { runAsLeader, releaseLeadership } from "./runtime/leader";
import { startScheduler, stopScheduler } from "./scheduler";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../../dist/public");

async function main() {
  await connectDb();

  const app = Fastify({
    logger: { level: env.isProd ? "info" : "warn" },
    bodyLimit: 8 * 1024 * 1024,
    // Railway's edge proxy adds the visitor's address; trust exactly that one hop so req.ip is
    // the real client (per-visitor rate limits, admin login lockout) and can't be spoofed.
    trustProxy: (_address: string, hop: number) => hop === 0,
  });

  registerCanonicalHost(app); // first, so it covers every route
  await app.register(cookie, { secret: env.sessionSecret });
  if (!env.isProd) {
    await app.register(cors, { origin: ["http://localhost:5173"], credentials: true });
  }
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  // Tolerate empty JSON bodies (bodyless POSTs like creating a chat) instead of 400ing.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const text = body as string;
    // Keep the raw payload around for Stripe webhook signature verification.
    (req as any).rawBody = text;
    if (!text || text.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error as Error);
    }
  });

  app.get("/api/health", async () => ({ status: "ok", time: new Date().toISOString() }));
  // Stripe webhook at the root path — the configured Stripe endpoint is /webhooks.
  // (Also available at /api/webhooks/stripe via billingRoutes.)
  app.post("/webhooks", stripeWebhookHandler);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(billingRoutes, { prefix: "/api" });
  await app.register(chatRoutes, { prefix: "/api" });
  await app.register(connectionRoutes, { prefix: "/api" });
  await app.register(taskRoutes, { prefix: "/api" });
  await app.register(monitorRoutes, { prefix: "/api" });
  await app.register(autoReplyRoutes, { prefix: "/api" });
  await app.register(overviewRoutes, { prefix: "/api" });
  await app.register(reportRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api" });

  // Serve the built React app in production (single Railway service). `index: false` so every
  // page — including "/" — goes through the SEO handler that writes per-page head tags.
  if (fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, index: false });
    registerSeo(app, publicDir);
  }

  await app.listen({ host: "0.0.0.0", port: env.port });
  console.log(`RelayFlow server listening on http://localhost:${env.port}`);

  // Background services: channel sessions, scheduler, monitors. Only ONE server may run them
  // (see runtime/leader.ts) — two servers sharing a session get it revoked by WhatsApp/Telegram.
  // DISABLE_BACKGROUND=true runs the API only (local testing against the production database).
  if (process.env.DISABLE_BACKGROUND === "true") {
    console.log("[server] background services disabled (DISABLE_BACKGROUND=true)");
  } else {
    runAsLeader(
      () => {
        resumeConnections().catch((error) => console.error("[connectors] resume failed", error));
        startScheduler();
      },
      () => {
        stopScheduler();
        stopConnections().catch(() => undefined);
      },
    ).catch((error) => console.error("[leader] failed", error));
  }

  // On deploy, Railway stops the old server: close sessions WITHOUT logging out and release the
  // lock so the new server takes over within seconds.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[server] ${signal}: handing over channel connections`);
    stopScheduler();
    await stopConnections().catch(() => undefined);
    await releaseLeadership();
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
