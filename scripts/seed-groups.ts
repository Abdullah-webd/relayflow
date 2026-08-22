import { connectDb, users, connections, destinations } from "../src/server/db";
import { uid } from "../src/server/lib/crypto";

async function main() {
  await connectDb();
  const user = await users().findOne({ email: "demo@relayflow.test" });
  if (!user) throw new Error("run scripts/seed.ts first");
  const now = new Date();
  // one connected whatsapp connection
  await connections().deleteMany({ userId: user._id, platform: "whatsapp" });
  const connId = uid();
  await connections().insertOne({
    _id: connId, userId: user._id, platform: "whatsapp", status: "connected", displayName: "WhatsApp",
    externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: now, createdAt: now, updatedAt: now,
  } as any);
  await destinations().deleteMany({ connectionId: connId });
  const groups = ["Squad Hackathon 3.0", "Squad Hackathon 3.0", "Dev Syndicate", "General Chat"];
  for (let i = 0; i < groups.length; i++) {
    await destinations().insertOne({
      _id: uid(), userId: user._id, connectionId: connId, platform: "whatsapp",
      externalId: `1200000${i}@g.us`, name: groups[i], kind: "group", selected: true, createdAt: now, updatedAt: now,
    } as any);
  }
  console.log("seeded whatsapp connection with", groups.length, "groups for demo user");
  process.exit(0);
}
main();
