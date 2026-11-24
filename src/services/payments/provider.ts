/**
 * Payment provider abstraction.
 *
 * Invoices are provider-agnostic: an invoice is OPEN, a link gets created,
 * a webhook confirms payment, refunds are issued. Each provider implements
 * this interface; the rest of the codebase never imports a provider SDK directly.
 */

export interface PaymentLink {
  /** URL the customer visits to pay */
  url: string;
  /** Provider's ID for this payment attempt */
  providerPaymentId: string;
  /** Amount in smallest currency unit (paise for INR, cents for USD) */
  amountMinor: number;
  currency: string;
}

export interface ParsedWebhookEvent {
  /** Provider-unique event id — used for webhook idempotency */
  id: string;
  type: string;
  /** Our invoice id, extracted from provider metadata */
  invoiceId?: string;
  providerPaymentId?: string;
  /** Amount paid, smallest currency unit */
  amountMinor?: number;
  /** Provider's raw payload, stored in WebhookEvent.payload for replay */
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;

  createPaymentLink(opts: {
    invoiceId: string;
    amountMinor: number;
    currency: string;
    description: string;
    customerName: string;
    customerEmail: string;
  }): Promise<PaymentLink>;

  /** Throws if signature invalid. Returns parsed event or null (unhandled type). */
  verifyAndParseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ParsedWebhookEvent | null;

  createRefund(providerPaymentId: string, amountMinor: number): Promise<{ refundId: string }>;
}
