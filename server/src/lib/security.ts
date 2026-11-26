import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config.js";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hmac(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signCsrf(nonce: string): string {
  const signature = createHmac("sha256", config.csrfSecret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyCsrf(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const [nonce] = value.split(".");
  if (!nonce) return false;
  const expected = signCsrf(nonce);
  const a = Buffer.from(expected);
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16_384;
  const r = 8;
  const p = 1;
  const derived = (await scrypt(password, salt, 32, {
    N, r, p, maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltEncoded, hashEncoded] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashEncoded, "base64");
  const salt = Buffer.from(saltEncoded, "base64");
  const actual = (await scrypt(password, salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashForIndex(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}
