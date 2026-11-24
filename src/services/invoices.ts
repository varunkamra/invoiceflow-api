import { prisma } from "../lib/prisma.js";
import { notFound } from "./customers.js";

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  dueDate: Date;
  currency?: string;
  notes?: string;
  taxBps?: number; // basis points, e.g. 1000 = 10%
  items: InvoiceItemInput[];
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["OPEN", "VOID"],
  OPEN: ["PAID", "VOID", "UNCOLLECTIBLE"],
  PAID: [],
  VOID: [],
  UNCOLLECTIBLE: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Generate the next invoice number for an org: INV-2026-0001.
 * Runs inside the caller's transaction using SELECT ... FOR UPDATE (via raw query)
 * on the org row so two concurrent creates can't mint the same number.
 */
async function nextInvoiceNumber(tx: any, organizationId: string): Promise<string> {
  await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${organizationId} FOR UPDATE`;
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { organizationId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
  });
  const next = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createInvoice(orgId: string, input: CreateInvoiceInput) {
  // Validate customer belongs to this org up front
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, organizationId: orgId } });
  if (!customer) throw notFound("customer not found");

  const items = input.items.map((i) => {
    const totalCents = Math.round(i.quantity * i.unitPriceCents);
    return { ...i, totalCents };
  });
  const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  const taxCents = input.taxBps ? Math.round((subtotalCents * input.taxBps) / 10_000) : 0;

  return prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, orgId);
    return tx.invoice.create({
      data: {
        organizationId: orgId,
        number,
        customerId: input.customerId,
        dueDate: input.dueDate,
        currency: input.currency ?? "usd",
        notes: input.notes,
        subtotalCents,
        taxCents,
        totalCents: subtotalCents + taxCents,
        items: { create: items },
      },
      include: { items: true, customer: { select: { name: true, email: true } } },
    });
  });
}

export async function getInvoice(orgId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    include: { items: true, customer: { select: { name: true, email: true } }, payments: true },
  });
  if (!invoice) throw notFound("invoice not found");
  return invoice;
}

export function listInvoices(
  orgId: string,
  opts: { status?: string; customerId?: string; limit?: number; offset?: number }
) {
  const where = {
    organizationId: orgId,
    ...(opts.status ? { status: opts.status as any } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
  };
  return prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 20,
      skip: opts.offset ?? 0,
      include: { customer: { select: { name: true, email: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);
}

export async function transitionInvoice(orgId: string, id: string, to: "OPEN" | "VOID" | "UNCOLLECTIBLE") {
  const invoice = await getInvoice(orgId, id);
  if (!canTransition(invoice.status, to)) {
    const err = new Error(`cannot transition ${invoice.status} → ${to}`) as Error & { statusCode?: number };
    err.statusCode = 422;
    throw err;
  }
  return prisma.invoice.update({
    where: { id },
    data: { status: to, ...(to === "VOID" ? { voidedAt: new Date() } : {}) },
    include: { items: true },
  });
}

export async function updateDraftInvoice(
  orgId: string,
  id: string,
  input: Partial<CreateInvoiceInput>
) {
  const invoice = await getInvoice(orgId, id);
  if (invoice.status !== "DRAFT") {
    const err = new Error("only DRAFT invoices can be edited") as Error & { statusCode?: number };
    err.statusCode = 422;
    throw err;
  }
  return prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      const items = input.items.map((i) => {
        const totalCents = Math.round(i.quantity * i.unitPriceCents);
        return { ...i, totalCents };
      });
      const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
      const taxCents = input.taxBps ? Math.round((subtotalCents * input.taxBps) / 10_000) : 0;
      return tx.invoice.update({
        where: { id },
        data: {
          dueDate: input.dueDate ?? invoice.dueDate,
          notes: input.notes,
          taxBps: input.taxBps,
          subtotalCents,
          taxCents,
          totalCents: subtotalCents + taxCents,
          items: { create: items },
        },
        include: { items: true },
      });
    }
    return tx.invoice.update({
      where: { id },
      data: { dueDate: input.dueDate, notes: input.notes },
      include: { items: true },
    });
  });
}
