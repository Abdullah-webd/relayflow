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
  ["whatsapp", "vip", "VIP customers", "group"],
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
  { _id: "r-shop", userId: uid, name: "Shop FAQs", active: true, instructions: "Answer questions about our products, prices, opening hours and delivery.\nKeep replies short and friendly.\nNever discuss refunds or complaints. Leave those for me.", destinationIds: ["d-shop", "d-vip"], createdAt: new Date(now - 5 * 24 * H), updatedAt: new Date() },
  { _id: "r-whole", userId: uid, name: "Wholesale orders", active: false, instructions: "Answer questions about minimum order quantities, bulk prices and pickup times.\nNever agree to discounts.", destinationIds: ["d-wholesale"], createdAt: new Date(now - 2 * 24 * H), updatedAt: new Date() },
  { _id: "r-club", userId: uid, name: "Running club info", active: true, instructions: "Answer questions about run times, routes and meeting points. Don't reply to chit-chat.", destinationIds: ["d-club"], createdAt: new Date(now - 24 * H), updatedAt: new Date() },
] as any);
await knowledgeDocs().insertMany([
  { _id: "k1", userId: uid, responderId: "r-shop", title: "Price list (October)", source: "text", text: "Rice 50kg: N78,000. Plantain chips: N1,500 a pack. Delivery to Lekki: N2,500, same day before 1pm.", chars: 2140, createdAt: new Date(now - 4 * 24 * H) },
  { _id: "k2", userId: uid, responderId: "r-shop", title: "Opening hours and location", source: "text", text: "Open Monday to Saturday, 9am to 6pm. 14 Admiralty Way, Lekki Phase 1.", chars: 380, createdAt: new Date(now - 4 * 24 * H) },
  { _id: "k3", userId: uid, responderId: "r-club", title: "Club handbook", source: "pdf", text: "Saturday runs start 6am at Lekki-Ikoyi bridge. Tuesday intervals 6:30pm.", chars: 8410, createdAt: new Date(now - 24 * H) },
] as any);
await destinations().updateMany({ _id: { $in: ["d-shop", "d-vip", "d-club"] } }, { $set: { autoReplyEnabled: true, autoReplyLastSeenAt: new Date() } });
await destinations().updateMany({ _id: { $in: ["d-shop", "d-vip"] } }, { $set: { responderId: "r-shop" } });
await destinations().updateOne({ _id: "d-wholesale" }, { $set: { responderId: "r-whole" } });
await destinations().updateOne({ _id: "d-club" }, { $set: { responderId: "r-club" } });

const log = (i: number, rid: string, rname: string, dest: string, platform: string, from: string, incoming: string, reply: string | null, reason: string | null, ago: number) => ({
  _id: `ar-${i}`, userId: uid, responderId: rid, responderName: rname, platform, connectionId: `demo-${platform}`, destinationExternalId: dest, destinationName: dest, incomingFrom: from, incomingText: incoming, replied: Boolean(reply), replyText: reply, reason, createdAt: new Date(now - ago),
});
await autoReplies().insertMany([
  log(1, "r-shop", "Shop FAQs", "Obi Foods customers", "whatsapp", "Tolu", "Do you deliver to Lekki today?", "Yes! Delivery to Lekki is ₦2,500, and it arrives the same day if you order before 1pm.", null, 12 * 60_000),
  log(2, "r-shop", "Shop FAQs", "Obi Foods customers", "whatsapp", "Ngozi", "I want a refund for yesterday's order", null, "Refunds are something the business handles itself.", 50 * 60_000),
  log(3, "r-club", "Running club info", "Lekki running club", "telegram", "Ada", "What time is Saturday's run?", "Saturday runs start at 6am at the Lekki-Ikoyi bridge.", null, 3 * H),
  log(4, "r-shop", "Shop FAQs", "VIP customers", "whatsapp", "Chidi Okafor", "Are you open on Sunday?", "We're open Monday to Saturday, 9am to 6pm, so closed on Sundays.", null, 7 * H),
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

// ---- A small population for the admin console: sign-ups, plans, usage, reports ----
const { usageDaily, reports } = await import("../../src/server/db");
const first = ["Tolu", "Bola", "Chidi", "Ngozi", "Emeka", "Funke", "Ada", "Kunle", "Ifeoma", "Segun", "Zainab", "Yusuf", "Kemi", "Obinna", "Halima", "Dayo", "Uche", "Femi", "Amina", "Tunde", "Nkechi", "Ibrahim"];
const sections = ["overview", "chat", "auto-replies", "monitors", "schedules", "connections", "settings"];
const weights = [5, 9, 4, 2, 1, 3, 1];
const D = 24 * H;
const demoUsers = first.map((name, i) => {
  const kind = i % 7 === 0 ? "pro" : i % 5 === 0 ? "starter" : i % 3 === 0 ? "ended" : "trial";
  const created = new Date(now - ((i * 37) % 29) * D - (i % 5) * H);
  return {
    _id: `demo-u${i}`,
    email: `${name.toLowerCase()}@example.com`,
    name: `${name} ${["Adeyemi", "Okafor", "Bello", "Eze", "Musa", "Ogunleye"][i % 6]}`,
    passwordHash: "x",
    emailVerified: i % 9 !== 4,
    timezone: "Africa/Lagos",
    subscriptionStatus: kind === "trial" || kind === "ended" ? "trialing" : "active",
    plan: kind === "starter" ? "starter" : kind === "pro" ? "pro" : null,
    stripeSubscriptionId: kind === "pro" || kind === "starter" ? `sub_demo_${i}` : null,
    trialSource: "app",
    trialStartedAt: created,
    trialEndsAt: kind === "trial" ? new Date(now + (6 + i) * H) : new Date(+created + D),
    currentPeriodEnd: kind === "pro" || kind === "starter" ? new Date(now + (3 + i) * D) : null,
    cancelAtPeriodEnd: i === 10,
    lastSeenAt: i < 3 ? new Date(now - (i + 1) * 20_000) : new Date(now - ((i * 13) % 70) * H),
    lastSection: sections[i % sections.length],
    createdAt: created,
    updatedAt: new Date(),
  };
});
await users().insertMany(demoUsers as any);
await users().updateOne({ _id: uid }, { $set: { lastSeenAt: new Date(now - 5_000), lastSection: "overview" } });
const usageRows = [];
for (const u of [{ _id: uid, createdAt: new Date(now - 6 * D) }, ...demoUsers]) {
  for (let d = 0; d < 30; d++) {
    const at = new Date(now - d * D);
    if (at < u.createdAt) continue;
    const seed = (u._id.length * 7 + d * 13) % 10;
    if (seed > 5) continue; // not every user every day
    const day = at.toISOString().slice(0, 10);
    sections.forEach((sec, si) => {
      if ((seed + si) % 3 === 0) return;
      usageRows.push({ _id: `${u._id}|${day}|${sec}`, userId: u._id, day, section: sec, views: 1 + ((seed + si) % 4), seconds: weights[si] * 30 * (1 + ((seed * si) % 5)), updatedAt: at });
    });
  }
}
await usageDaily().insertMany(usageRows as any);
await connections().insertMany([
  { _id: "demo-c-u1", userId: "demo-u1", platform: "whatsapp", status: "connected", displayName: "+234 802 000 0001" },
  { _id: "demo-c-u2", userId: "demo-u2", platform: "whatsapp", status: "error", displayName: "+234 802 000 0002", lastError: "WhatsApp signed RelayFlow out. Reconnect WhatsApp to continue." },
  { _id: "demo-c-u3", userId: "demo-u3", platform: "telegram", status: "connected", displayName: "Ngozi Eze" },
  { _id: "demo-c-u7", userId: "demo-u7", platform: "slack", status: "connected", displayName: "Kunle Studio" },
].map((c) => ({ externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: new Date(), createdAt: new Date(), updatedAt: new Date(now - 3 * H), ...c })) as any);
const rep = (i: number, userId: string, email: string, name: string, category: string, title: string, description: string, page: string | null, status: string, ago: number, adminReply: string | null = null) => ({
  _id: `demo-r${i}`, userId, email, name, category, title, description, page, screenshot: null,
  context: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", viewport: "390x844", plan: "pro (trialing)", channels: ["whatsapp: connected"] },
  status, adminReply, createdAt: new Date(now - ago), updatedAt: new Date(now - ago), resolvedAt: status === "resolved" ? new Date(now - ago / 2) : null,
});
await reports().insertMany([
  rep(1, "demo-u2", "bola@example.com", "Bola Okafor", "connection", "WhatsApp keeps disconnecting", "It shows Needs reconnecting every evening around 8pm. I reconnect and it works until the next day.", "connections", "open", 4 * 60_000),
  rep(2, "demo-u5", "funke@example.com", "Funke Ogunleye", "billing", "Charged twice this month", "I see two charges of $30 on my card for October.", "settings", "in_progress", 3 * H),
  rep(3, uid, "demo@relayflow.test", "Amaka Obi", "feature", "Let auto-replies send pictures", "Customers ask for photos of products. It would help if the auto-reply could send the product photo.", "auto-replies", "open", 9 * H),
  rep(4, "demo-u8", "ifeoma@example.com", "Ifeoma Adeyemi", "bug", "Chat stuck on Working on it", "I asked for a summary of my groups and it kept spinning for minutes.", "chat", "resolved", 30 * H, "Thanks Ifeoma, this is fixed. Summaries now finish in a few seconds."),
] as any);

console.log("demo ready: demo@relayflow.test / demo-password");
process.exit(0);
