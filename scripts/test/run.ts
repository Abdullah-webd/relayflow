// RelayFlow test harness: starts the real server against an isolated test database and runs
// every suite over HTTP + direct module calls. Usage: `npm test` (add TEST_AI=1 for AI checks).
import { TEST_DB, API } from "./env";
import { spawn } from "node:child_process";
import { results } from "./kit";

const started = Date.now();
let server: ReturnType<typeof spawn> | null = null;
let serverLog = "";
function startServer() {
  server = spawn("npx", ["tsx", "src/server/index.ts"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${API}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start:\n${serverLog.slice(-2000)}`);
}

async function main() {
  const { connectDb, db } = await import("../../src/server/db");
  await connectDb();
  if (!db().databaseName.endsWith("_test")) throw new Error("not a test database");
  await db().dropDatabase(); // fresh start (guarded: only *_test databases)
  startServer(); // the server recreates the indexes on startup
  await waitForServer();
  console.log(`RelayFlow tests · database ${TEST_DB} · server ${API}`);

  const suites = ["seo", "auth", "billing", "channels", "autoreplies", ...(process.env.TEST_AI === "1" ? ["monitors-ai"] : [])];
  for (const name of suites) {
    try {
      const mod = await import(`./suites/${name}.ts`);
      await mod.default();
    } catch (e) {
      results.push({ suite: name, name: "suite crashed", ok: false, info: (e as Error).stack?.split("\n").slice(0, 3).join(" ") || String(e) });
      console.log(`  ✗ FAIL  ${name} crashed: ${(e as Error).message}`);
    }
  }
  await db().dropDatabase();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  [${f.suite}] ${f.name}${f.info ? ` — ${f.info}` : ""}`);
  }
  return failed.length;
}

main()
  .then((failed) => { server?.kill("SIGTERM"); process.exit(failed ? 1 : 0); })
  .catch((e) => { console.error(e); server?.kill("SIGTERM"); process.exit(1); });
