// Starts the real server in the test environment (isolated *_test database, no channel
// sessions, dummy Stripe key, no email). Used by Playwright's webServer.
import "./env";
await import("../../src/server/index");
