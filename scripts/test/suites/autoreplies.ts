import { users, destinations, knowledgeBase, knowledgeDocs, autoReplies, responders, type User } from "../../../src/server/db";
import { createSession } from "../../../src/server/auth/session";
import { handleInbound } from "../../../src/server/knowledge/autoReply";
import { suite, check, api } from "../kit";

let n = 0;
async function mkUser(over: Partial<User> = {}) {
  const now = new Date();
  const u: User = { _id: `ar-${Date.now()}-${n++}`, email: `ar${Date.now()}${n}@example.invalid`, passwordHash: "x", emailVerified: true, timezone: "UTC", subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(Date.now() + 864e5), createdAt: now, updatedAt: now, ...over };
  await users().insertOne(u);
  return { u, token: await createSession(u._id) };
}
async function mkGroup(userId: string, conn: string, ext: string, name: string, extra: Record<string, unknown> = {}) {
  const id = `${conn}-${ext}`;
  await destinations().insertOne({ _id: id, userId, connectionId: conn, platform: "whatsapp", externalId: ext, name, kind: "group", selected: true, createdAt: new Date(), updatedAt: new Date(), ...extra } as any);
  return id;
}
const json = (b: unknown) => JSON.stringify(b);

export default async function autoreplies() {
  suite("Auto-replies: separate groups, knowledge and rules");
  const { u, token } = await mkUser();
  const conn = `${u._id}-wa`;
  const shop = await mkGroup(u._id, conn, "shop@g.us", "Shop customers");
  const club = await mkGroup(u._id, conn, "club@g.us", "Running club");

  const a = (await api("/api/auto-replies", { method: "POST", token, body: json({ name: "Shop FAQs" }) })).body.responder?.id;
  const b = (await api("/api/auto-replies", { method: "POST", token, body: json({ name: "Club rules" }) })).body.responder?.id;
  check("create two separate auto-replies", Boolean(a && b) && a !== b);

  let r = await api(`/api/auto-replies/${a}`, { method: "PATCH", token, body: json({ active: true }) });
  check("can't go live without groups", r.status === 400 && r.body.error === "needs_groups");
  await api(`/api/auto-replies/${a}`, { method: "PATCH", token, body: json({ destinationIds: [shop, "someone-elses-group"], instructions: "Never discuss refunds." }) });
  r = await api(`/api/auto-replies/${a}`, { method: "PATCH", token, body: json({ active: true }) });
  check("can't go live without knowledge", r.status === 400 && r.body.error === "needs_knowledge");
  await api(`/api/auto-replies/${a}/docs`, { method: "POST", token, body: json({ title: "Prices", source: "text", text: "Delivery to Lekki costs N2,500." }) });
  await api(`/api/auto-replies/${b}/docs`, { method: "POST", token, body: json({ title: "Club", source: "text", text: "Runs start at 6am on Saturdays." }) });
  r = await api(`/api/auto-replies/${a}`, { method: "PATCH", token, body: json({ active: true }) });
  check("goes live with groups + knowledge", r.status === 200);

  let list = (await api("/api/auto-replies", { token })).body;
  const A = list.responders.find((x: any) => x.id === a);
  check("each auto-reply keeps its own knowledge", A?.docs.length === 1 && A.docs[0].title === "Prices" && list.responders.find((x: any) => x.id === b)?.docs[0]?.title === "Club");
  check("each auto-reply keeps its own rules", A?.instructions === "Never discuss refunds.");
  check("other people's groups are ignored", A?.destinationIds.join() === shop);
  check("live auto-reply switches its group on", (await destinations().findOne({ _id: shop }))?.autoReplyEnabled === true && (await destinations().findOne({ _id: club }))?.autoReplyEnabled !== true);

  // A group belongs to one auto-reply: claiming it moves it.
  await api(`/api/auto-replies/${b}`, { method: "PATCH", token, body: json({ destinationIds: [shop, club], active: true }) });
  list = (await api("/api/auto-replies", { token })).body;
  check("a group moves to the auto-reply that claims it", list.responders.find((x: any) => x.id === a)?.destinationIds.length === 0 && (await destinations().findOne({ _id: shop }))?.responderId === b);
  await api(`/api/auto-replies/${a}`, { method: "PATCH", token, body: json({ destinationIds: [shop] }) });

  // Incoming messages are handled by the group's own auto-reply.
  await handleInbound({ userId: u._id, platform: "whatsapp", connectionId: conn, destinationExternalId: "club@g.us", destinationName: "Running club", senderName: "Ada", text: "What time is the run?" });
  await handleInbound({ userId: u._id, platform: "whatsapp", connectionId: conn, destinationExternalId: "shop@g.us", destinationName: "Shop customers", senderName: "Bola", text: "How much is delivery?" });
  const logs = await autoReplies().find({ userId: u._id }).toArray();
  check("each group is answered by its own auto-reply", logs.find((l) => l.incomingFrom === "Ada")?.responderId === b && logs.find((l) => l.incomingFrom === "Bola")?.responderId === a);

  await api(`/api/auto-replies/${b}`, { method: "PATCH", token, body: json({ active: false }) });
  check("pausing switches its groups off", (await destinations().findOne({ _id: club }))?.autoReplyEnabled === false);
  const paused = await handleInbound({ userId: u._id, platform: "whatsapp", connectionId: conn, destinationExternalId: "club@g.us", destinationName: "Running club", senderName: "Ada", text: "Hello?" });
  check("paused auto-reply stays silent", paused.replied === false);

  await api(`/api/auto-replies/${a}`, { method: "DELETE", token });
  check("deleting removes its knowledge and frees its groups", (await knowledgeDocs().countDocuments({ responderId: a })) === 0 && (await destinations().findOne({ _id: shop }))?.autoReplyEnabled === false);

  const { token: other } = await mkUser();
  check("can't touch another account's auto-reply", (await api(`/api/auto-replies/${b}`, { method: "PATCH", token: other, body: json({ name: "x" }) })).status === 404);

  const { token: st } = await mkUser({ subscriptionStatus: "active", plan: "starter", stripeSubscriptionId: "sub_ar" });
  check("Starter: auto-replies are Pro-only", (await api("/api/auto-replies", { method: "POST", token: st, body: json({ name: "x" }) })).status === 403);

  suite("Auto-replies: existing setups carry over");
  const { u: old, token: ot } = await mkUser();
  const oconn = `${old._id}-wa`;
  const og = await mkGroup(old._id, oconn, "old@g.us", "Old group", { autoReplyEnabled: true, autoReplyLastSeenAt: new Date() });
  await knowledgeBase().insertOne({ _id: old._id, userId: old._id, guardrails: "Be polite.", createdAt: new Date(), updatedAt: new Date() });
  await knowledgeDocs().insertOne({ _id: `${old._id}-doc`, userId: old._id, title: "Old FAQ", source: "text", text: "We open at 9.", chars: 13, createdAt: new Date() });
  const res = await handleInbound({ userId: old._id, platform: "whatsapp", connectionId: oconn, destinationExternalId: "old@g.us", destinationName: "Old group", senderName: "Chi", text: "When do you open?" });
  const migrated = await responders().find({ userId: old._id }).toArray();
  check("old setup becomes one live auto-reply (even before visiting the page)", migrated.length === 1 && migrated[0].active && migrated[0].instructions === "Be polite." && migrated[0].destinationIds.join() === og);
  check("old knowledge moves into it", (await knowledgeDocs().findOne({ _id: `${old._id}-doc` }))?.responderId === migrated[0]._id && res.reason !== "no active auto-reply for this group");
  await api("/api/auto-replies", { token: ot });
  check("migration runs once", (await responders().countDocuments({ userId: old._id })) === 1);

  if (process.env.TEST_AI === "1") {
    suite("Auto-replies: real AI answers only from its own knowledge");
    const { token: ai } = await mkUser();
    const shopId = (await api("/api/auto-replies", { method: "POST", token: ai, body: json({ name: "Shop", instructions: "Keep replies short." }) })).body.responder.id;
    const clubId = (await api("/api/auto-replies", { method: "POST", token: ai, body: json({ name: "Club" }) })).body.responder.id;
    await api(`/api/auto-replies/${shopId}/docs`, { method: "POST", token: ai, body: json({ title: "Delivery", source: "text", text: "Delivery to Lekki costs N2,500 and arrives the same day if you order before 1pm." }) });
    await api(`/api/auto-replies/${clubId}/docs`, { method: "POST", token: ai, body: json({ title: "Runs", source: "text", text: "Saturday runs start at 6am at the Lekki-Ikoyi bridge." }) });
    const q = json({ message: "How much is delivery to Lekki?" });
    const shopTry = (await api(`/api/auto-replies/${shopId}/try`, { method: "POST", token: ai, body: q })).body;
    check("answers from its own facts", shopTry.reply === true && /2,?500/.test(shopTry.answer), shopTry.answer || shopTry.reason);
    const clubTry = (await api(`/api/auto-replies/${clubId}/try`, { method: "POST", token: ai, body: q })).body;
    check("another auto-reply without those facts stays silent", clubTry.reply === false, clubTry.reason);
  }

  suite("Overview");
  const ov = await api("/api/overview", { token });
  check("overview loads with a 7-day chart", ov.status === 200 && ov.body.volume?.length === 7 && typeof ov.body.setup?.connected === "boolean");
  check("group picker lists connected channels", (await api("/api/channels", { token })).status === 200);
}
