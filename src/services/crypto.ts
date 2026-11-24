import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * scrypt password hashing — stores as `scrypt:<saltHex>:<hashHex>`.
 * (bcrypt/argon2 need native builds; scrypt is built into Node and solid.)
 */
export async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function compare(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt") return false;
  const derived = (await scryptAsync(password, Buffer.from(saltHex, "hex"), 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
}
