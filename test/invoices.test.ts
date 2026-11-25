import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import { uniq } from "./helpers.js";

let app: FastifyInstance;
let token: string;
let customerId: string;
const auth = () => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await buildApp();
  const email = uniq("inv") + "@test.com";
  const reg = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "password123", name: "I", orgName: "Inv Org" },
  });
  token = reg.json().token;
  const cust = await app.inject({
    method: "POST",
    url: "/customers",
    headers: auth(),
    payload: { name: "Acme", email: uniq("acme") + "@test.com", country: "US" },
  });
  customerId = cust.json().id;
});

async function createInvoice(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: "/invoices",
    headers: auth(),
    payload: { customerId, dueDate: "2026-12-15", ...payload },
  });
  return res;
}

describe("invoices", () => {
  it("creates an invoice with correct math", async () => {
    const res = await createInvoice({
      taxBps: 1000,
      items: [
        { description: "Hosting", quantity: 2, unitPriceCents: 9900 },
        { description: "Setup", quantity: 1, unitPriceCents: 50000 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json();
    // 2*9900 + 50000 = 69800, tax 10% = 6980, total 76780
    expect(inv.subtotalCents).toBe(69800);
    expect(inv.taxCents).toBe(6980);
    expect(inv.totalCents).toBe(76780);
    expect(inv.status).toBe("DRAFT");
    expect(inv.number).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("assigns sequential per-org numbers", async () => {
    const a = await (await createInvoice({ items: [{ description: "x", quantity: 1, unitPriceCents: 100 }] })).json();
    const b = await (await createInvoice({ items: [{ description: "x", quantity: 1, unitPriceCents: 100 }] })).json();
    const numA = parseInt(a.number.slice(-4), 10);
    const numB = parseInt(b.number.slice(-4), 10);
    expect(numB).toBe(numA + 1);
  });

  it("enforces the state machine", async () => {
    const inv = await (await createInvoice({ items: [{ description: "x", quantity: 1, unitPriceCents: 100 }] })).json();

    // DRAFT → OPEN ok
    const open = await app.inject({ method: "POST", url: `/invoices/${inv.id}/open`, headers: auth() });
    expect(open.statusCode).toBe(200);

    // editing an OPEN invoice is refused
    const patch = await app.inject({
      method: "PATCH",
      url: `/invoices/${inv.id}`,
      headers: auth(),
      payload: { notes: "nope" },
    });
    expect(patch.statusCode).toBe(422);

    // OPEN → OPEN is invalid
    const reopen = await app.inject({ method: "POST", url: `/invoices/${inv.id}/open`, headers: auth() });
    expect(reopen.statusCode).toBe(422);

    // OPEN → VOID ok, then VOID → anything is invalid
    const voidIt = await app.inject({ method: "POST", url: `/invoices/${inv.id}/void`, headers: auth() });
    expect(voidIt.statusCode).toBe(200);
    const revoid = await app.inject({ method: "POST", url: `/invoices/${inv.id}/void`, headers: auth() });
    expect(revoid.statusCode).toBe(422);
  });

  it("refuses to mix invoices across organizations", async () => {
    // second org
    const email = uniq("other") + "@test.com";
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "password123", name: "O", orgName: "Other Org" },
    });
    const otherToken = reg.json().token;

    // create invoice in org 1
    const inv = await (await createInvoice({ items: [{ description: "x", quantity: 1, unitPriceCents: 100 }] })).json();

    // try to read it as org 2
    const res = await app.inject({
      method: "GET",
      url: `/invoices/${inv.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("validates items (empty array, bad price)", async () => {
    const res = await createInvoice({ items: [] });
    expect(res.statusCode).toBe(400);
    const res2 = await createInvoice({ items: [{ description: "x", quantity: 1, unitPriceCents: -5 }] });
    expect(res2.statusCode).toBe(400);
  });
});
