import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import { env } from "./env";
import { connectDb } from "./db";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { connectionRoutes } from "./routes/connections";
import { taskRoutes } from "./routes/tasks";
import { billingRoutes } from "./routes/billing";
import { resumeConnections } from "./connectors/manager";
import { startScheduler } from "./scheduler";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../../dist/public");

async function main() {
  await connectDb();

  const app = Fastify({
    logger: { level: env.isProd ? "info" : "warn" },
    bodyLimit: 8 * 1024 * 1024,
  });

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
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(billingRoutes, { prefix: "/api" });
  await app.register(chatRoutes, { prefix: "/api" });
  await app.register(connectionRoutes, { prefix: "/api" });
  await app.register(taskRoutes, { prefix: "/api" });

  // Serve the built React app in production (single Railway service).
  if (fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith("/api")) {
        return reply.code(404).send({ error: "not_found" });
      }
      // Never cache the SPA shell so a new build's hashed assets are always picked up.
      reply.header("Cache-Control", "no-store");
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ host: "0.0.0.0", port: env.port });
  console.log(`RelayFlow server listening on http://localhost:${env.port}`);

  // Background services (best-effort; never crash the server).
  resumeConnections().catch((error) => console.error("[connectors] resume failed", error));
  startScheduler();
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
