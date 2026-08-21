import bcrypt from "bcryptjs";
import { connectDb, users } from "../src/server/db";
import { uid } from "../src/server/lib/crypto";

async function main() {
  await connectDb();
  const email = "demo@relayflow.test";
  await users().deleteOne({ email });
  await users().insertOne({
    _id: uid(),
    email,
    name: "Demo User",
    passwordHash: await bcrypt.hash("Demo12345!", 10),
    emailVerified: true,
    timezone: "Africa/Lagos",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("seeded verified user:", email, "/ Demo12345!");
  process.exit(0);
}
main();
