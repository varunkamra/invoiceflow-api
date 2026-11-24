import Stripe from "stripe";
import { env } from "../config/env.js";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Create (or reuse) a Stripe customer for an org's end-customer.
 * Stripe customers are namespaced per tenant via metadata.
 */
export async function ensureStripeCustomer(orgId: string, customerId: string, email: string, name: string) {
  return stripe.customers.create({
    email,
    name,
    metadata: { orgId, customerId },
  });
}

/** Create a hosted checkout/payment page for an open invoice. */
export async function createInvoiceCheckout(opts: {
  invoiceId: string;
  customerId: string;
  stripeCustomerId: string;
  totalCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: opts.stripeCustomerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: opts.currency,
          unit_amount: opts.totalCents,
          product_data: { name: opts.description },
        },
      },
    ],
    metadata: { invoiceId: opts.invoiceId },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
}
