import { createHmac } from "node:crypto";
import { users, connections, destinations, channelMessages, locks, type User } from "../../../src/server/db";
import { encryptJson } from "../../../src/server/lib/crypto";
import { _ingestWaMessage } from "../../../src/server/connectors/whatsapp";
import { _ingestTelegramMessage } from "../../../src/server/connectors/telegram";
import { handleSlackEvent, verifySlackSignature } from "../../../src/server/connectors/slack";
import { getRecentMessages, resolveSendTargets, sendToTargets } from "../../../src/server/connectors/manager";
import { toolByName } from "../../../src/server/agent/tools";
import { acquireLock } from "../../../src/server/runtime/leader";
import { suite, check, api, sleep, nowSec } from "../kit";

export async function channelUser() {
  const id = `chan-${Date.now()}`;
  const u: User = { _id: id, email: `${id}@example.invalid`, passwordHash: "x", emailVerified: true, timezone: "UTC", subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(Date.now() + 864e5), createdAt: new Date(), updatedAt: new Date() };
  await users().insertOne(u);
  const mkConn = async (platform: "whatsapp" | "telegram" | "slack", extra: Record<string, unknown> = {}) => {
    const cid = `${id}-${platform}`;
    await connections().insertOne({ _id: cid, userId: id, platform, status: "connected", displayName: platform, externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: null, createdAt: new Date(), updatedAt: new Date(), ...extra } as any);
    return cid;
  };
  return { user: u, mkConn };
}

export default async function channels() {
  suite("Channels: ingestion, reading, safety");
  const { user, mkConn } = await channelUser();
  const wa = await mkConn("whatsapp");
  const dm = "2348011111111@s.whatsapp.net", grp = "120363000000000000@g.us";
  const msg = (jid: string, id: string, fromMe: boolean, text: string, ago = 60, pushName = "Chidi Okafor") =>
    ({ key: { remoteJid: jid, id, fromMe }, pushName, messageTimestamp: nowSec() - ago, message: { conversation: text } });
  await _ingestWaMessage(user._id, wa, msg(dm, "A1", false, "Do you deliver to Lekki?"), false);
  await _ingestWaMessage(user._id, wa, msg(grp, "A2", false, "Meeting moved to 3pm", 50, "Amara"), false);
  await _ingestWaMessage(user._id, wa, msg(grp, "A3", true, "Noted, thanks", 40, "Me"), false);
  await _ingestWaMessage(user._id, wa, msg("status@broadcast", "A4", false, "my status", 30), false);
  await _ingestWaMessage(user._id, wa, msg(grp, "A5", false, "Old message", 3 * 86400, "Amara"), true);
  await _ingestWaMessage(user._id, wa, msg(grp, "A2", false, "Meeting moved to 3pm", 50, "Amara"), false);
  const stored = await channelMessages().find({ connectionId: wa }).toArray();
  check("WhatsApp groups stored", stored.some((m) => m.destinationId === grp && m.senderName === "Amara"));
  check("private chats are never stored (groups only)", !stored.some((m) => m.destinationId === dm) && !(await destinations().findOne({ connectionId: wa, externalId: dm })));
  check("your own phone messages stored as 'You'", stored.some((m) => m.text === "Noted, thanks" && m.senderName === "You"));
  check("status broadcasts ignored", !stored.some((m) => m.text === "my status"));
  check("history stored; duplicates stored once", stored.length === 3, `${stored.length}`);
  await _ingestWaMessage(user._id, wa, { key: { remoteJid: grp, id: "A6", fromMe: false, participant: "2348099999999@s.whatsapp.net" }, messageTimestamp: nowSec(), message: { conversation: "no push name" } }, false);
  const anon = await channelMessages().findOne({ connectionId: wa, text: "no push name" });
  check("sender without a display name shows their number", anon?.senderName === "+2348099999999", String(anon?.senderName));

  // A private chat stored before groups-only must stay invisible and unreachable.
  await destinations().insertOne({ _id: `${wa}-olddm`, userId: user._id, connectionId: wa, platform: "whatsapp", externalId: "2348033333333@s.whatsapp.net", name: "E", kind: "dm", selected: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await channelMessages().insertOne({ _id: `${wa}-olddm-msg`, userId: user._id, connectionId: wa, platform: "whatsapp", destinationId: "2348033333333@s.whatsapp.net", destinationName: "E", externalId: "old:1", senderName: "E", direction: "inbound", text: "a private message", occurredAt: new Date(), createdAt: new Date() } as any);
  const recent = await getRecentMessages(user._id, { platform: "whatsapp" });
  check("agent reads groups, newest first", recent[0]?.text === "no push name" && recent.some((r) => r.destinationName === "Amara's group" || r.destinationExternalId === grp));
  check("old private chats are hidden from reading", !recent.some((r) => r.text === "a private message") && (await getRecentMessages(user._id, { group: "E" })).length === 0);
  await destinations().updateOne({ connectionId: wa, externalId: grp }, { $set: { name: "vhynez Unusual fans" } });
  await destinations().insertOne({ _id: `${wa}-e`, userId: user._id, connectionId: wa, platform: "whatsapp", externalId: "555@g.us", name: "E", kind: "group", selected: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const named = await resolveSendTargets(user._id, ["whatsapp"], "vhynez Unusual");
  check("a one-letter group 'E' is never picked for 'vhynez Unusual'", named.length === 1 && named[0].name === "vhynez Unusual fans", named.map((t) => t.name).join(","));
  check("an exact name wins over partial matches", (await resolveSendTargets(user._id, ["whatsapp"], "E")).map((t) => t.name).join() === "E");
  check("sending never targets a private chat", (await resolveSendTargets(user._id, ["whatsapp"], "2348033333333@s.whatsapp.net")).length === 0);
  const forced = await sendToTargets(user._id, [{ platform: "whatsapp", connectionId: wa, externalId: "2348033333333@s.whatsapp.net", name: "E" }, { platform: "whatsapp", connectionId: wa, externalId: "unknown@g.us", name: "?" }], "hi");
  check("a private or unknown chat is refused even if asked for directly", forced.every((r) => !r.ok && /groups and channels/.test(r.error || "")));
  const empty: any = await toolByName.get("get_recent_messages")!.handler(user._id, { platform: "whatsapp", group: "vhynez Unusual fans", limit: 5 });
  check("tool returns messages for a named group", empty.count >= 3);
  await destinations().insertOne({ _id: `${wa}-quiet`, userId: user._id, connectionId: wa, platform: "whatsapp", externalId: "999@g.us", name: "Quiet Group", kind: "group", selected: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const quiet: any = await toolByName.get("get_recent_messages")!.handler(user._id, { platform: "whatsapp", group: "Quiet Group", limit: 5 });
  check("empty chat → honest note (no invented time span)", quiet.count === 0 && /hasn't received any messages/.test(quiet.note || ""));
  const targets = await resolveSendTargets(user._id, ["whatsapp"], null);
  check("broadcasts never include private chats", targets.every((t) => !t.externalId.endsWith("@s.whatsapp.net")) && targets.length >= 1);

  const tg = await mkConn("telegram");
  const fake = (o: any) => ({ getChat: async () => o.chat, getSender: async () => o.sender, ...o });
  await _ingestTelegramMessage(user._id, tg, fake({ id: 11, chatId: "555", isPrivate: true, out: false, message: "Hello from Telegram", date: nowSec(), chat: { firstName: "Tunde", lastName: "Bello" }, sender: { firstName: "Tunde", lastName: "Bello" } }), false);
  check("Telegram private chats are ignored", !(await destinations().findOne({ connectionId: tg, externalId: "555" })) && (await channelMessages().countDocuments({ connectionId: tg })) === 0);

  suite("Slack security & live events");
  const sl = await mkConn("slack", { externalId: "T_TEST", slackUserId: "U_ME", encryptedCredentials: encryptJson({ token: "xoxp-fake" }) });
  await handleSlackEvent({ type: "event_callback", team_id: "T_TEST", authorizations: [{ user_id: "U_ME" }], event: { type: "message", channel: "C1", channel_type: "channel", user: "U_X", text: "Can I get a quote?", ts: `${nowSec()}.000100` } });
  await handleSlackEvent({ type: "event_callback", team_id: "T_TEST", authorizations: [{ user_id: "U_ME" }], event: { type: "message", subtype: "channel_join", channel: "C1", user: "U_X", text: "joined", ts: `${nowSec()}.000200` } });
  await handleSlackEvent({ type: "event_callback", team_id: "T_TEST", authorizations: [{ user_id: "U_ME" }], event: { type: "message", channel: "D1", channel_type: "im", user: "U_X", text: "private hello", ts: `${nowSec()}.000300` } });
  check("Slack live event stored; joins and direct messages ignored", (await channelMessages().countDocuments({ connectionId: sl })) === 1);
  const ts = String(nowSec()), body = JSON.stringify({ type: "url_verification", challenge: "abc" });
  const sig = "v0=" + createHmac("sha256", "test-signing-secret").update(`v0:${ts}:${body}`).digest("hex");
  check("genuine Slack signature accepted", verifySlackSignature(body, ts, sig));
  check("forged / replayed signatures rejected", !verifySlackSignature(body + " ", ts, sig) && !verifySlackSignature(body, String(nowSec() - 600), sig));
  const ok = await api("/api/slack/events", { method: "POST", body, headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig } });
  check("events URL verification works", ok.status === 200 && ok.body.challenge === "abc");
  check("unsigned requests refused", (await api("/api/slack/events", { method: "POST", body, headers: { "x-slack-request-timestamp": ts, "x-slack-signature": "v0=bad" } })).status === 401);

  suite("Deploy safety (single-runner lock)");
  const L = `test-lock-${Date.now()}`;
  check("first server takes the lock", await acquireLock(L, "A", 1500));
  check("second server must wait", !(await acquireLock(L, "B", 1500)));
  await sleep(1700);
  check("lock taken over after the holder dies", await acquireLock(L, "B", 1500));
  await locks().deleteOne({ _id: L });
}
