import crypto from "node:crypto";
import type { PaymentProvider, PaymentLink, ParsedWebhookEvent } from "./provider.js";
import { env } from "../../config/env.js";

/**
 * Razorpay implementation.
 *
 * API docs: https://razorpay.com/docs/api/
 * - Payment Links: POST /v1/payment_links
 * - Webhook signature: HMAC-SHA256 of the raw body with the webhook secret,
 *   delivered in the x-razorpay-signature header
 * - Refunds: POST /v1/payments/:id/refund
 */

const RZP_API = "https://api.razorpay.com/v1";

// Razorpay uses paise (1/100 INR) as minor unit for INR — same convention as cents
export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createPaymentLink(opts): Promise<PaymentLink> {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`${RZP_API}/payment_links`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: opts.amountMinor,
        currency: opts.currency.toUpperCase(),
        description: opts.description.slice(0, 255),
        customer: { name: opts.customerName, email: opts.customerEmail },
        // carried through webhooks so we can map the event back to our invoice
        reference_id: opts.invoiceId,
        notes: { invoiceId: opts.invoiceId },
        reminder_enable: false, // we do our own dunning via BullMQ
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`razorpay payment link failed: ${res.status} ${body}`) as Error & {
        statusCode?: number;
      };
      err.statusCode = 502;
      throw err;
    }

    const data = (await res.json()) as {
      id: string;
      short_url: string;
      amount: number;
      currency: string;
    };
    return {
      url: data.short_url,
      providerPaymentId: data.id,
      amountMinor: data.amount,
      currency: data.currency.toLowerCase(),
    };
  },

  verifyAndParseWebhook(rawBody, headers): ParsedWebhookEvent | null {
    const signature = headers["x-razorpay-signature"];
    // Read the secret at call time (not import time) so it can rotate without
    // a process restart — and so tests can inject a test secret.
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) {
      throw new Error("missing webhook signature");
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // timing-safe compare — never short-circuit on first differing byte
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new Error("invalid webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      event: string;
      payload: {
        payment?: {
          entity?: {
            id: string;
            amount: number;
            notes?: Record<string, string>;
            reference_id?: string;
          };
        };
      };
    };

    const payment = payload.payload?.payment?.entity;
    if (!payment) return null; // event type we don't act on

    switch (payload.event) {
      case "payment_link.paid":
      case "payment.captured":
        return {
          id: `rzp_${payload.event}_${payment.id}`,
          type: payload.event,
          invoiceId: payment.reference_id ?? payment.notes?.invoiceId,
          providerPaymentId: payment.id,
          amountMinor: payment.amount,
          raw: payload,
        };
      default:
        return null; // stored, but no state change
    }
  },

  async createRefund(providerPaymentId, amountMinor) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`${RZP_API}/payments/${providerPaymentId}/refund`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: amountMinor }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw Object.assign(new Error(`razorpay refund failed: ${res.status} ${body}`), { statusCode: 502 });
    }
    const data = (await res.json()) as { id: string };
    return { refundId: data.id };
  },
};
