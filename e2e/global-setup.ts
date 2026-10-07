import { execSync } from "node:child_process";

// Seeds test accounts (skipped when testing a live BASE_URL — never write to production).
export default function globalSetup() {
  if (process.env.BASE_URL) return;
  execSync("npx tsx scripts/test/e2e-seed.ts", {
    stdio: "inherit",
    env: { ...process.env, TEST_DB_NAME: "relayflow_e2e_test", TEST_PORT: "8788" },
  });
}
