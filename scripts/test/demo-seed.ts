// Seeds an isolated demo database with a realistic account so the dashboard can be tried locally
// without touching real data. Usage:
//   TEST_DB_NAME=relayflow_demo_test npx tsx scripts/test/demo-seed.ts
//   TEST_DB_NAME=relayflow_demo_test TEST_PORT=8790 npx tsx scripts/test/serve.ts
// then sign in at http://localhost:8790/login as demo@relayflow.test / demo-password
import "./env";
import bcrypt from "bcryptjs";
const { connectDb, db, users, chats, connections, destinations, channelMessages, responders, knowledgeDocs, autoReplies, monitors, scheduledTasks } = await import("../../src/server/db");
await connectDb();
if (!db().databaseName.endsWith("_test")) throw new Error("refusing to seed a non-test database");
await db().dropDatabase();

const now = Date.now();
const H = 3_600_000;
const uid = "demo-user";
await users().insertOne({
  _id: uid,
  email: "demo@relayflow.test",
  name: "Amaka Obi",
  passwordHash: await bcrypt.hash("demo-password", 10),
  emailVerified: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  subscriptionStatus: "trialing",
  trialSource: "app",
  trialEndsAt: new Date(now + 20 * H),
  createdAt: new Date(now - 6 * 24 * H),
  updatedAt: new Date(),
} as any);

const conn = (platform: string, displayName: string) => ({ _id: `demo-${platform}`, userId: uid, platform, status: "connected", displayName, externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
await connections().insertMany([conn("whatsapp", "+234 803 555 0142"), conn("telegram", "Amaka Obi"), conn("slack", "Obi Foods")] as any);

const groups: [string, string, string, string][] = [
  ["whatsapp", "shop", "Obi Foods customers", "group"],
  ["whatsapp", "wholesale", "Wholesale buyers", "group"],
  ["whatsapp", "riders", "Delivery riders", "group"],
  ["whatsapp", "chidi", "Chidi Okafor", "dm"],
  ["telegram", "club", "Lekki running club", "group"],
  ["telegram", "deals", "Obi Foods deals", "channel"],
  ["slack", "ops", "#operations", "channel"],
  ["slack", "orders", "#orders", "channel"],
];
for (const [platform, ext, name, kind] of groups)
  await destinations().insertOne({ _id: `d-${ext}`, userId: uid, connectionId: `demo-${platform}`, platform, externalId: ext, name, kind, selected: true, createdAt: new Date(), updatedAt: new Date() } as any);

// A week of inbound messages, busier on recent days.
const lines = ["Do you deliver to Lekki?", "How much is a bag of rice?", "Are you open on Sunday?", "Please send the price list", "Order confirmed, thanks!", "Is the plantain chips back in stock?", "Running late, starting 6:15", "Can I pay on delivery?"];
const senders = ["Tolu", "Bola", "Chidi", "Ngozi", "Emeka", "Funke", "Ada", "Kunle"];
const msgs = [];
let n = 0;
for (let day = 6; day >= 0; day--) {
  const perPlatform: Record<string, number> = { whatsapp: 18 + (6 - day) * 4 + (day % 2) * 6, telegram: 6 + (day % 3) * 3, slack: day === 1 || day === 2 ? 2 : 9 + (day % 2) * 4 };
  for (const [platform, count] of Object.entries(perPlatform)) {
    const pool = groups.filter((g) => g[0] === platform);
    for (let i = 0; i < count; i++) {
      const g = pool[i % pool.length];
      const at = new Date(now - day * 24 * H - ((i * 37) % 600) * 60_000 - 5 * 60_000);
      msgs.push({ _id: `m-${n}`, userId: uid, connectionId: `demo-${platform}`, platform, destinationId: g[1], destinationName: g[2], externalId: `${g[1]}:${n++}`, senderName: senders[i % senders.length], direction: "inbound", text: lines[i % lines.length], occurredAt: at, createdAt: at });
    }
  }
}
await channelMessages().insertMany(msgs as any);

await responders().insertMany([
  { _id: "r-shop", userId: uid, name: "Shop FAQs", active: true, instructions: "Answer questions about our products, prices, opening hours and delivery.\nKeep replies short and friendly.\nNever discuss refunds or complaints. Leave those for me.", destinationIds: ["d-shop", "d-chidi"], createdAt: new Date(now - 5 * 24 * H), updatedAt: new Date() },
  { _id: "r-whole", userId: uid, name: "Wholesale orders", active: false, instructions: "Answer questions about minimum order quantities, bulk prices and pickup times.\nNever agree to discounts.", destinationIds: ["d-wholesale"], createdAt: new Date(now - 2 * 24 * H), updatedAt: new Date() },
  { _id: "r-club", userId: uid, name: "Running club info", active: true, instructions: "Answer questions about run times, routes and meeting points. Don't reply to chit-chat.", destinationIds: ["d-club"], createdAt: new Date(now - 24 * H), updatedAt: new Date() },
] as any);
await knowledgeDocs().insertMany([
  { _id: "k1", userId: uid, responderId: "r-shop", title: "Price list (October)", source: "text", text: "Rice 50kg: N78,000. Plantain chips: N1,500 a pack. Delivery to Lekki: N2,500, same day before 1pm.", chars: 2140, createdAt: new Date(now - 4 * 24 * H) },
  { _id: "k2", userId: uid, responderId: "r-shop", title: "Opening hours and location", source: "text", text: "Open Monday to Saturday, 9am to 6pm. 14 Admiralty Way, Lekki Phase 1.", chars: 380, createdAt: new Date(now - 4 * 24 * H) },
  { _id: "k3", userId: uid, responderId: "r-club", title: "Club handbook", source: "pdf", text: "Saturday runs start 6am at Lekki-Ikoyi bridge. Tuesday intervals 6:30pm.", chars: 8410, createdAt: new Date(now - 24 * H) },
] as any);
await destinations().updateMany({ _id: { $in: ["d-shop", "d-chidi", "d-club"] } }, { $set: { autoReplyEnabled: true, autoReplyLastSeenAt: new Date() } });
await destinations().updateMany({ _id: { $in: ["d-shop", "d-chidi"] } }, { $set: { responderId: "r-shop" } });
await destinations().updateOne({ _id: "d-wholesale" }, { $set: { responderId: "r-whole" } });
await destinations().updateOne({ _id: "d-club" }, { $set: { responderId: "r-club" } });

const log = (i: number, rid: string, rname: string, dest: string, platform: string, from: string, incoming: string, reply: string | null, reason: string | null, ago: number) => ({
  _id: `ar-${i}`, userId: uid, responderId: rid, responderName: rname, platform, connectionId: `demo-${platform}`, destinationExternalId: dest, destinationName: dest, incomingFrom: from, incomingText: incoming, replied: Boolean(reply), replyText: reply, reason, createdAt: new Date(now - ago),
});
await autoReplies().insertMany([
  log(1, "r-shop", "Shop FAQs", "Obi Foods customers", "whatsapp", "Tolu", "Do you deliver to Lekki today?", "Yes! Delivery to Lekki is ₦2,500, and it arrives the same day if you order before 1pm.", null, 12 * 60_000),
  log(2, "r-shop", "Shop FAQs", "Obi Foods customers", "whatsapp", "Ngozi", "I want a refund for yesterday's order", null, "Refunds are something the business handles itself.", 50 * 60_000),
  log(3, "r-club", "Running club info", "Lekki running club", "telegram", "Ada", "What time is Saturday's run?", "Saturday runs start at 6am at the Lekki-Ikoyi bridge.", null, 3 * H),
  log(4, "r-shop", "Shop FAQs", "Chidi Okafor", "whatsapp", "Chidi Okafor", "Are you open on Sunday?", "We're open Monday to Saturday, 9am to 6pm, so closed on Sundays.", null, 7 * H),
  log(5, "r-shop", "Shop FAQs", "Obi Foods customers", "whatsapp", "Kunle", "Can I pay with crypto?", null, "The facts don't cover payment methods.", 26 * H),
] as any);

await monitors().insertMany([
  { _id: "mon1", userId: uid, title: "Quote requests", platform: "whatsapp", group: "Wholesale buyers", condition: "someone asks for a quote or bulk price", mode: "match", intervalMinutes: 30, active: true, lastCheckedAt: new Date(now - 25 * 60_000), lastSeenAt: new Date(), absenceDeadline: null, expiresAt: null, notified: [], lastResult: "Matched: Emeka asked for a quote on 20 bags of rice", createdAt: new Date(now - 3 * 24 * H), updatedAt: new Date() },
  { _id: "mon2", userId: uid, title: "Upset customers", platform: "whatsapp", group: null, condition: "a customer complains or sounds upset", mode: "match", intervalMinutes: 30, active: true, lastCheckedAt: new Date(now - 4 * 60_000), lastSeenAt: new Date(), absenceDeadline: null, expiresAt: null, notified: [], lastResult: "Checked — no match", createdAt: new Date(now - 2 * 24 * H), updatedAt: new Date() },
  { _id: "mon3", userId: uid, title: "Rider check-in", platform: "whatsapp", group: "Delivery riders", condition: "a rider confirms they've picked up today's orders", mode: "absence", intervalMinutes: 30, active: false, lastCheckedAt: new Date(now - 30 * H), lastSeenAt: new Date(), absenceDeadline: null, expiresAt: null, notified: [], lastResult: null, createdAt: new Date(now - 4 * 24 * H), updatedAt: new Date() },
] as any);

const tomorrow9 = new Date(now + 24 * H);
tomorrow9.setHours(9, 0, 0, 0);
await scheduledTasks().insertMany([
  { _id: "t1", userId: uid, title: "Morning summary", instruction: "Summarize overnight messages across all my channels and email it to me.", schedule: "daily", runAt: tomorrow9, timezone: "UTC", active: true, lastRunAt: new Date(now - 15 * H), lastResult: "Sent: 42 new messages, 3 customer questions waiting.", createdAt: new Date(), updatedAt: new Date() },
  { _id: "t2", userId: uid, title: "Weekly deals post", instruction: "Send this week's deals to the Obi Foods deals channel.", schedule: "weekly", runAt: new Date(now + 3 * 24 * H), timezone: "UTC", active: true, lastRunAt: null, lastResult: null, createdAt: new Date(), updatedAt: new Date() },
] as any);

await chats().insertMany(["Who asked about delivery today?", "Wholesale buyers follow-up", "Send Sunday opening notice"].map((title, i) => ({ _id: `demo-chat-${i}`, userId: uid, title, createdAt: new Date(now - i * 5 * H), updatedAt: new Date(now - i * 5 * H) })) as any);

console.log("demo ready: demo@relayflow.test / demo-password");
process.exit(0);
