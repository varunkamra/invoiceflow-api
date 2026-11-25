import { execSync } from "node:child_process";

/**
 * Runs once before the whole suite. Creates a dedicated test database
 * (separate from the dev one) and applies all migrations to it.
 */
export default function globalSetup() {
  const host = process.env.TEST_DB_HOST ?? "localhost";
  const port = process.env.TEST_DB_PORT ?? "5433";
  const url = `postgresql://invoiceflow:invoiceflow@${host}:${port}/invoiceflow_test`;

  // Create the test database if it doesn't exist (idempotent)
  try {
    execSync(
      `docker compose exec -T postgres psql -U invoiceflow -c "CREATE DATABASE invoiceflow_test"`,
      { cwd: process.cwd(), stdio: "pipe" }
    );
  } catch {
    // already exists — fine
  }

  // Apply migrations to the test database
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-0123456789";
  process.env.NODE_ENV = "test";
}
