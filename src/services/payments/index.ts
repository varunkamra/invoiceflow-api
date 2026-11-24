import type { PaymentProvider } from "./provider.js";
import { razorpayProvider } from "./razorpay.js";

/**
 * Provider selection. One provider active per deployment; the interface keeps
 * the swap to a one-line change (see stripe.ts stub for the second implementation).
 */
export const paymentProvider: PaymentProvider = razorpayProvider;

export type { PaymentProvider, PaymentLink, ParsedWebhookEvent } from "./provider.js";
