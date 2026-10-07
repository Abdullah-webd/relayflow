// Seeds the e2e database with test accounts and writes their session tokens for Playwright.
import "./env";
import fs from "node:fs";
const { connectDb, db, users, chats } = await import("../../src/server/db");
const { createSession } = await import("../../src/server/auth/session");
await connectDb();
if (!db().databaseName.endsWith("_test")) throw new Error("refusing to seed a non-test database");
await db().dropDatabase();
const now = Date.now();
const mk = async (id: string, extra: Record<string, unknown>) => {
  await users().insertOne({ _id: id, email: `${id}@example.invalid`, name: "Test User", passwordHash: "x", emailVerified: true, timezone: "UTC", createdAt: new Date(), updatedAt: new Date(), ...extra } as any);
  return createSession(id);
};
const trial = await mk("e2e-trial", { subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(now + 864e5) });
await chats().insertMany(["Morning check-in", "Wholesale buyers follow-up", "Support summary"].map((title, i) => ({ _id: `e2e-chat-${i}`, userId: "e2e-trial", title, createdAt: new Date(now - i * 1000), updatedAt: new Date(now - i * 1000) })) as any);
// Connected WhatsApp with two groups, for the auto-reply flow.
const { connections, destinations } = await import("../../src/server/db");
await connections().insertOne({ _id: "e2e-wa", userId: "e2e-trial", platform: "whatsapp", status: "connected", displayName: "+234 800 000 0000", externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: new Date(), createdAt: new Date(), updatedAt: new Date() } as any);
for (const [ext, name] of [["shop", "Shop customers"], ["club", "Running club"]])
  await destinations().insertOne({ _id: `e2e-d-${ext}`, userId: "e2e-trial", connectionId: "e2e-wa", platform: "whatsapp", externalId: `${ext}@g.us`, name, kind: "group", selected: true, createdAt: new Date(), updatedAt: new Date() } as any);
const expired = await mk("e2e-expired", { subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(now - 60_000) });
const starter = await mk("e2e-starter", { subscriptionStatus: "active", plan: "starter", stripeSubscriptionId: "sub_dummy" });
fs.writeFileSync("e2e/.auth.json", JSON.stringify({ trial, expired, starter }));
console.log("e2e seed ready");
process.exit(0);
