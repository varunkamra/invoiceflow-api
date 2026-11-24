import type { PaymentProvider } from "./provider.js";

/**
 * Stripe adapter — stub.
 *
 * Razorpay is the active provider (see index.ts). Stripe is kept as a
 * documented stub: the interface is provider-neutral, so implementing
 * Stripe means filling in these four methods — no changes anywhere else.
 *
 * Implementation notes for whoever picks this up:
 * - createPaymentLink → stripe.paymentLinks.create() (or Checkout Sessions)
 * - webhook → stripe.webhooks.constructEvent(rawBody, sigHeader, secret)
 *   (Stripe signs with a header + timestamp tolerance, not a plain HMAC)
 * - refunds → stripe.refunds.create({ payment_intent, amount })
 */
export const stripeProvider: PaymentProvider = {
  name: "stripe",
  createPaymentLink: notImplemented,
  verifyAndParseWebhook: notImplemented,
  createRefund: notImplemented,
};

function notImplemented(): never {
  throw Object.assign(new Error("stripe provider not configured"), { statusCode: 503 });
}
