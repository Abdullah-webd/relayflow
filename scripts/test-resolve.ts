import { connectDb, users, connections } from "../src/server/db";
import { resolveSendTargets, listDestinations } from "../src/server/connectors/manager";

async function main() {
  await connectDb();
  const u = await users().findOne({ email: "demo@relayflow.test" });
  if (!u) throw new Error("seed first");
  await connections().updateOne({ userId: u._id, platform: "whatsapp" }, { $set: { status: "connected" } });

  console.log("list_destinations:", (await listDestinations(u._id)).map((d) => d.name));
  const t1 = await resolveSendTargets(u._id, ["whatsapp"], "Squad Hackathon 3.0");
  console.log("group + platform=whatsapp   ->", t1.length, t1.map((t) => t.name));
  const t2 = await resolveSendTargets(u._id, [], "Squad Hackathon 3.0");
  console.log("group + NO platform         ->", t2.length, t2.map((t) => t.name));
  const t3 = await resolveSendTargets(u._id, ["all"], "squad hackathon");
  console.log("group fuzzy + all           ->", t3.length, t3.map((t) => t.name));
  const t4 = await resolveSendTargets(u._id, ["all"], null);
  console.log("all selected (no group)     ->", t4.length, t4.map((t) => t.name));
  process.exit(0);
}
main();
