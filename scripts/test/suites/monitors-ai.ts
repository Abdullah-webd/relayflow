import { monitors } from "../../../src/server/db";
import { uid } from "../../../src/server/lib/crypto";
import { _ingestWaMessage } from "../../../src/server/connectors/whatsapp";
import { channelUser } from "./channels";
import { suite, check, sleep, nowSec } from "../kit";

// Uses the real AI model (costs a little). Runs only with `npm run test:ai`.
export default async function monitorsAi() {
  suite("Instant monitors (real AI)");
  const { user, mkConn } = await channelUser();
  const wa = await mkConn("whatsapp");
  const mk = async (title: string, condition: string) => {
    const id = uid();
    await monitors().insertOne({ _id: id, userId: user._id, title, platform: "whatsapp", group: null, condition, mode: "match", intervalMinutes: 30, active: true,
      lastCheckedAt: new Date(), lastSeenAt: new Date(), absenceDeadline: null, expiresAt: null, notified: [], lastResult: null, createdAt: new Date(), updatedAt: new Date() } as any);
    return id;
  };
  const price = await mk("Price questions", "someone asks about prices or how much something costs");
  const any = await mk("Any new message", "any new message arrives, including ones I send myself");
  await sleep(1100);
  const t0 = Date.now();
  await _ingestWaMessage(user._id, wa, { key: { remoteJid: "120363000000000111@g.us", participant: "2348011111111@s.whatsapp.net", id: "P1", fromMe: false }, pushName: "Chidi", messageTimestamp: nowSec(), message: { conversation: "How much is 50 cartons?" } }, false);
  let p: any;
  for (let i = 0; i < 45 && !String(p?.lastResult).startsWith("Matched"); i++) { await sleep(1000); p = await monitors().findOne({ _id: price }); }
  check("monitor alerts within seconds of a matching message", String(p?.lastResult).startsWith("Matched"), `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await sleep(1100);
  await _ingestWaMessage(user._id, wa, { key: { remoteJid: "120363000000000000@g.us", id: "P2", fromMe: true }, pushName: "Me", messageTimestamp: nowSec(), message: { conversation: "Testing: sent by me" } }, false);
  let a: any;
  for (let i = 0; i < 45 && !/sent by me|You/.test(String(a?.lastResult)); i++) { await sleep(1000); a = await monitors().findOne({ _id: any }); }
  check("monitor sees messages you send yourself", String(a?.lastResult).startsWith("Matched"), String(a?.lastResult).slice(0, 60));
}
