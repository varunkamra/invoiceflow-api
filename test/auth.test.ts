import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import { uniq } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

describe("auth", () => {
  it("registers a user + org + owner membership atomically", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: uniq("reg") + "@test.com",
        password: "password123",
        name: "Test",
        orgName: "Test Org",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.organization.name).toBe("Test Org");
  });

  it("rejects duplicate email", async () => {
    const email = uniq("dup") + "@test.com";
    const payload = { email, password: "password123", name: "T", orgName: "O" };
    await app.inject({ method: "POST", url: "/auth/register", payload });
    const res = await app.inject({ method: "POST", url: "/auth/register", payload });
    expect(res.statusCode).toBe(409);
  });

  it("rejects weak password / bad email via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "123", name: "T", orgName: "O" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("logs in with correct credentials", async () => {
    const email = uniq("login") + "@test.com";
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "hunter2hunter2", name: "L", orgName: "LO" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "hunter2hunter2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeDefined();
  });

  it("rejects wrong password", async () => {
    const email = uniq("badpw") + "@test.com";
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "right-password", name: "B", orgName: "BO" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("guards protected routes without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/customers" });
    expect(res.statusCode).toBe(401);
  });
});
