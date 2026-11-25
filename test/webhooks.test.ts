import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { buildApp } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import { uniq } from "./helpers.js";

/**
 * Webhook tests: build real Razorpay-shaped payloads, sign them with a test
 * secret, and verify the endpoint's behavior — signature check, idempotency,
 * and the OPEN → PAID transition with a Payment row.
 */
const TEST_WEBHOOK_SECRET = "test-webhook-secret";

function sign(payload: string): string {
  return crypto.createHmac("sha256", TEST_WEBHOOK_SECRET).update(payload).digest("hex");
}

function paymentLinkPaidEvent(invoiceId: string, paymentId: string) {
  return {
    event: "payment_link.paid",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: 10000,
          currency: "USD",
          status: "captured",
          reference_id: invoiceId,
          notes: { invoiceId },
        },
      },
    },
  };
}

let app: FastifyInstance;
let token: string;
let customerId: string;
const auth = () => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
  process.env.RAZORPAY_KEY_SECRET = "fake";
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  app = await buildApp();
  const email = uniq("wh") + "@test.com";
  const reg = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "password123", name: "W", orgName: "WH Org" },
  });
  token = reg.json().token;
  const cust = await app.inject({
    method: "POST",
    url: "/customers",
    headers: auth(),
    payload: { name: "Webhook Cust", email: uniq("wc") + "@test.com" },
  });
  customerId = cust.json().id;
});

async function createOpenInvoice() {
  const inv = await (
    await app.inject({
      method: "POST",
      url: "/invoices",
      headers: auth(),
      payload: {
        customerId,
        dueDate: "2026-12-15",
        items: [{ description: "work", quantity: 1, unitPriceCents: 10000 }],
      },
    })
  ).json();
  await app.inject({ method: "POST", url: `/invoices/${inv.id}/open`, headers: auth() });
  return inv;
}

function postWebhook(event: object, sig = sign(JSON.stringify(event))) {
  return app.inject({
    method: "POST",
    url: "/webhooks/razorpay",
    headers: { "content-type": "application/json", "x-razorpay-signature": sig },
    payload: Buffer.from(JSON.stringify(event)), // raw body
  });
}

describe("razorpay webhook", () => {
  it("rejects invalid signature", async () => {
    const event = paymentLinkPaidEvent("nonexistent", "pay_fake");
    const res = await postWebhook(event, "bad-signature");
    expect(res.statusCode).toBe(401);
  });

  it("marks invoice PAID and records a Payment on payment_link.paid", async () => {
    const inv = await createOpenInvoice();
    const event = paymentLinkPaidEvent(inv.id, `pay_${uniq("pay")}`);
    const res = await postWebhook(event);
    expect(res.statusCode).toBe(200);

    const invoice = await app.inject({
      method: "GET",
      url: `/invoices/${inv.id}`,
      headers: auth(),
    });
    const body = invoice.json();
    expect(body.status).toBe("PAID");
    expect(body.paidAt).toBeTruthy();
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].amountCents).toBe(10000);
  });

  it("is idempotent — the same event twice does not double-pay", async () => {
    const inv = await createOpenInvoice();
    const event = paymentLinkPaidEvent(inv.id, `pay_${uniq("pay")}`);
    const res1 = await postWebhook(event);
    expect(res1.statusCode).toBe(200);
    const res2 = await postWebhook(event); // exact same event id
    expect(res2.statusCode).toBe(200);

    const invoice = await app.inject({ method: "GET", url: `/invoices/${inv.id}`, headers: auth() });
    expect(invoice.json().payments).toHaveLength(1);
  });

  it("returns 500 for a validly-signed event referencing a missing invoice (provider will retry)", async () => {
    const event = paymentLinkPaidEvent("cmNoSuchInvoiceId", `pay_${uniq("pay")}`);
    const res = await postWebhook(event);
    expect(res.statusCode).toBe(500);
  });
});
