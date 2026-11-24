import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../plugins/auth.js";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  transitionInvoice,
  updateDraftInvoice,
} from "../services/invoices.js";
import { paymentProvider } from "../services/payments/index.js";
import { paymentsConfigured } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const itemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().max(10_000),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  dueDate: z.coerce.date(),
  currency: z.string().length(3).default("usd"),
  notes: z.string().max(2000).optional(),
  taxBps: z.number().int().min(0).max(10000).optional(),
  items: z.array(itemSchema).min(1).max(100),
});

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = z
      .object({
        status: z.enum(["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"]).optional(),
        customerId: z.string().optional(),
        limit: z.coerce.number().max(100).default(20),
        offset: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);
    const [invoices, total] = await listInvoices(req.auth!.organizationId, q);
    return { data: invoices, total };
  });

  app.get("/:id", async (req) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return getInvoice(req.auth!.organizationId, id);
  });

  app.post("/", async (req, reply) => {
    requireRole(req, "ADMIN");
    const body = createSchema.parse(req.body);
    const invoice = await createInvoice(req.auth!.organizationId, body);
    return reply.code(201).send(invoice);
  });

  app.patch("/:id", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = createSchema
      .extend({ items: z.array(itemSchema).min(1).max(100).optional() })
      .partial()
      .parse(req.body);
    return updateDraftInvoice(req.auth!.organizationId, id, body);
  });

  app.post("/:id/open", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return transitionInvoice(req.auth!.organizationId, id, "OPEN");
  });

  app.post("/:id/void", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return transitionInvoice(req.auth!.organizationId, id, "VOID");
  });

  app.post("/:id/payment-link", async (req, reply) => {
    requireRole(req, "ADMIN");
    if (!paymentsConfigured) {
      return reply.code(503).send({ error: "payments not configured" });
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const invoice = await getInvoice(req.auth!.organizationId, id);
    if (invoice.status !== "OPEN") {
      const err = new Error("payment links can only be created for OPEN invoices") as Error & {
        statusCode?: number;
      };
      err.statusCode = 422;
      throw err;
    }
    const link = await paymentProvider.createPaymentLink({
      invoiceId: invoice.id,
      amountMinor: invoice.totalCents,
      currency: invoice.currency,
      description: `Invoice ${invoice.number}`,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripePaymentIntentId: link.providerPaymentId, stripeHostedUrl: link.url },
    });
    return reply.code(201).send({ url: link.url, providerPaymentId: link.providerPaymentId });
  });

  app.post("/:id/mark-uncollectible", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return transitionInvoice(req.auth!.organizationId, id, "UNCOLLECTIBLE");
  });
}
