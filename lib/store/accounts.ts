// Accounts and sign-in sessions, kept in data/accounts.json.
// Passwords are stored only as salted scrypt hashes; session cookies are
// stored only as SHA-256 hashes, so a copy of the file can't be replayed.

import "server-only";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { dataDir, readJson, update } from "./files";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

interface UserRecord extends User {
  password_hash: string;
}

interface SessionRecord {
  token_hash: string;
  user_id: string;
  expires_at: string;
}

interface AccountsFile {
  users: UserRecord[];
  sessions: SessionRecord[];
}

export const SESSION_DAYS = 30;
const SCRYPT = { cost: 15, blockSize: 8, parallel: 1, keyLength: 32 };

const file = () => path.join(dataDir(), "accounts.json");
const empty = (): AccountsFile => ({ users: [], sessions: [] });

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists. Sign in instead.");
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallel: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      length,
      { N: 2 ** cost, r: blockSize, p: parallel, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Format: scrypt$<log2 N>$<r>$<p>$<salt>$<hash>, salt and hash in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT.cost, SCRYPT.blockSize, SCRYPT.parallel, SCRYPT.keyLength);
  return ["scrypt", SCRYPT.cost, SCRYPT.blockSize, SCRYPT.parallel, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallel, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(cost), Number(blockSize), Number(parallel), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const publicUser = ({ id, email, created_at }: UserRecord): User => ({ id, email, created_at });
const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export async function createUser(email: string, password: string): Promise<User> {
  const address = normalizeEmail(email);
  const password_hash = await hashPassword(password);
  return update(file(), empty, (accounts) => {
    if (accounts.users.some((u) => u.email === address)) throw new EmailTakenError();
    const user: UserRecord = { id: randomUUID(), email: address, password_hash, created_at: new Date().toISOString() };
    accounts.users.push(user);
    return publicUser(user);
  });
}

// Checked when the email is unknown, so a wrong email takes as long as a wrong password.
let decoy: Promise<string> | null = null;

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const address = normalizeEmail(email);
  const accounts = await readJson(file(), empty);
  const user = accounts.users.find((u) => u.email === address);
  if (!user) {
    await verifyPassword(password, await (decoy ??= hashPassword(randomUUID())));
    return null;
  }
  return (await verifyPassword(password, user.password_hash)) ? publicUser(user) : null;
}

/** Start a session and return the secret token to put in the visitor's cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await update(file(), empty, (accounts) => {
    accounts.sessions = accounts.sessions.filter((s) => Date.parse(s.expires_at) > now);
    accounts.sessions.push({
      token_hash: hashToken(token),
      user_id: userId,
      expires_at: new Date(now + SESSION_DAYS * 864e5).toISOString(),
    });
  });
  return token;
}

export async function findSessionUser(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const accounts = await readJson(file(), empty);
  const tokenHash = hashToken(token);
  const session = accounts.sessions.find((s) => s.token_hash === tokenHash);
  if (!session || Date.parse(session.expires_at) <= Date.now()) return null;
  const user = accounts.users.find((u) => u.id === session.user_id);
  return user ? publicUser(user) : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await update(file(), empty, (accounts) => {
    accounts.sessions = accounts.sessions.filter((s) => s.token_hash !== tokenHash);
  });
}

/** Set a new password and sign the account out everywhere. Returns false if no such account. */
export async function setPassword(email: string, password: string): Promise<boolean> {
  const address = normalizeEmail(email);
  const password_hash = await hashPassword(password);
  return update(file(), empty, (accounts) => {
    const user = accounts.users.find((u) => u.email === address);
    if (!user) return false;
    user.password_hash = password_hash;
    accounts.sessions = accounts.sessions.filter((s) => s.user_id !== user.id);
    return true;
  });
}
