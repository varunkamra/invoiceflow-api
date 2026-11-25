import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

/**
 * Test database strategy:
 *
 * Tests run against a dedicated test database (TEST_DATABASE_URL, falling
 * back to DATABASE_URL). The schema is ensured with `prisma migrate deploy`
 * — non-destructive, no reset needed. Each test creates its own org with
 * unique emails/slugs, so tests never collide.
 */
export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
}

export function ensureTestSchema() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: "pipe",
  });
}

/** Unique-ish suffix to keep concurrent test data isolated. */
export function uniq(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}
