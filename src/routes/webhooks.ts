import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { paymentProvider } from "../services/payments/index.js";
import { notFound } from "../services/customers.js";

/**
 * Payment provider webhook.
 *
 * Fastify parses JSON bodies by default — but signature verification must run
 * on the EXACT raw bytes the provider signed, so this route uses addContentTypeParser
 * (registered in server.ts) to capture the raw Buffer before parsing.
 */
export async function webhookRoutes(app: FastifyInstance) {
  // This plugin is registered via app.register() → child context, so this
  // parser applies only to routes here: raw Buffer for signature verification,
  // while the rest of the API keeps the default parsed-JSON behavior.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => done(null, body));

  app.post("/razorpay", async (req, reply) => {
    let event;
    try {
      event = paymentProvider.verifyAndParseWebhook(
        req.body as Buffer,
        req.headers as unknown as Record<string, string | undefined>
      );
    } catch (err) {
      // 400 → provider retries; bad signatures should not be retried silently
      req.log.warn({ err }, "webhook signature verification failed");
      return reply.code(400).send({ error: "invalid signature" });
    }

    if (!event) {
      // Signature was valid but it's an event type we don't act on
      return reply.code(200).send({ received: true, handled: false });
    }

    // Idempotency: event ids are unique per (provider, event, payment).
    // Insert-first wins races; duplicates hit the unique constraint and no-op.
    const inserted = await prisma.webhookEvent
      .create({
        data: {
          id: event.id,
          type: event.type,
          payload: event.raw as any,
        },
      })
      .catch(() => null); // unique violation → already processed

    if (!inserted) {
      return reply.code(200).send({ received: true, duplicate: true });
    }

    try {
      if (event.invoiceId && event.providerPaymentId && event.amountMinor != null) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: event.invoiceId },
          include: { organization: true },
        });
        if (!invoice) throw notFound(`invoice ${event.invoiceId} not found`);

        if (invoice.status === "OPEN") {
          await prisma.$transaction([
            prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "PAID",
                paidAt: new Date(),
                stripePaymentIntentId: event.providerPaymentId,
              },
            }),
            prisma.payment.create({
              data: {
                invoiceId: invoice.id,
                amountCents: event.amountMinor,
                method: "STRIPE", // TODO: rename enum to PROVIDER with Razorpay pivot
              },
            }),
          ]);
        }
        // PAID invoices receiving duplicate payment events: idempotent no-op (already inserted)
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      // Persist the failure for replay/diagnostics, then 500 so the provider retries
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { error: err instanceof Error ? err.message : "unknown" },
      });
      throw err;
    }

    return reply.code(200).send({ received: true });
  });
}
