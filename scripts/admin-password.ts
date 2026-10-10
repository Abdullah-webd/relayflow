// Creates a long random admin password and its hash for ADMIN_PASSWORD_HASH.
//   npx tsx scripts/admin-password.ts <admin email> <file to write the credentials to>
// The password is written ONLY to that file (mode 600), never printed, so it doesn't end up in
// terminal history or logs. Put ADMIN_EMAIL and ADMIN_PASSWORD_HASH in .env (local) or Railway.
import crypto from "node:crypto";
import fs from "node:fs";
import { hashAdminPassword } from "../src/server/admin/auth";

const [email, out] = process.argv.slice(2);
if (!email || !out) {
  console.error("usage: npx tsx scripts/admin-password.ts <email> <output file>");
  process.exit(1);
}
// 32 characters from a 62-letter alphabet ≈ 190 bits of randomness (unguessable). No look-alikes
// are removed because it is meant to be pasted from a password manager, not typed.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const password = Array.from({ length: 32 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
const hash = hashAdminPassword(password);
fs.writeFileSync(
  out,
  [
    "RelayFlow admin console",
    "URL (local):  http://localhost:8790/admin",
    "URL (live):   https://userelayflow.com/admin",
    `Email:        ${email.toLowerCase()}`,
    `Password:     ${password}`,
    "",
    "Server settings (Railway → relayflow → Variables):",
    `ADMIN_EMAIL=${email.toLowerCase()}`,
    `ADMIN_PASSWORD_HASH=${hash}`,
    "",
    "Save the password in a password manager, then delete this file.",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`Credentials written to ${out}`);
console.log(`ADMIN_EMAIL=${email.toLowerCase()}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
