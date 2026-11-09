#!/usr/bin/env node
// Reset a reader's password from the server, for when they've forgotten it.
// (The app sends no email, so there is no "forgot password" link.)
//
//   node scripts/set-password.mjs reader@example.com "their new password"
//
// Stop the app first, or run this while nobody is signing in: the app and
// this script must not write data/accounts.json at the same moment.

import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/set-password.mjs <email> "<new password>"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}

const file = path.join(path.resolve(process.env.DATA_DIR ?? "data"), "accounts.json");
let accounts;
try {
  accounts = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error(`No accounts file at ${file}. Is DATA_DIR set the same way as for the app?`);
  process.exit(1);
}

const user = accounts.users.find((u) => u.email === email.trim().toLowerCase());
if (!user) {
  console.error(`No account for ${email}.`);
  process.exit(1);
}

// Must match hashPassword() in lib/store/accounts.ts.
const cost = 15, blockSize = 8, parallel = 1;
const salt = randomBytes(16);
const key = scryptSync(password.normalize("NFKC"), salt, 32, {
  N: 2 ** cost, r: blockSize, p: parallel, maxmem: 256 * 1024 * 1024,
});
user.password_hash = ["scrypt", cost, blockSize, parallel, salt.toString("base64url"), key.toString("base64url")].join("$");
accounts.sessions = accounts.sessions.filter((s) => s.user_id !== user.id);

writeFileSync(`${file}.tmp`, JSON.stringify(accounts, null, 2));
renameSync(`${file}.tmp`, file);
console.log(`Password updated for ${user.email}. They have been signed out everywhere.`);
