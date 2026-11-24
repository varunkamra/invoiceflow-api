import { prisma } from "../lib/prisma.js";

export interface CustomerInput {
  name: string;
  email: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  taxId?: string;
}

export function listCustomers(orgId: string, opts: { search?: string; limit?: number; offset?: number }) {
  const where = {
    organizationId: orgId,
    ...(opts.search
      ? { OR: [{ name: { contains: opts.search, mode: "insensitive" as const } }, { email: { contains: opts.search, mode: "insensitive" as const } }] }
      : {}),
  };
  return prisma.$transaction([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.limit ?? 20, skip: opts.offset ?? 0 }),
    prisma.customer.count({ where }),
  ]);
}

export async function getCustomer(orgId: string, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, organizationId: orgId } });
  if (!customer) throw notFound("customer not found");
  return customer;
}

export async function createCustomer(orgId: string, input: CustomerInput) {
  const dupe = await prisma.customer.findUnique({
    where: { organizationId_email: { organizationId: orgId, email: input.email } },
  });
  if (dupe) {
    const err = new Error("a customer with this email already exists") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  return prisma.customer.create({ data: { organizationId: orgId, ...input } });
}

export async function updateCustomer(orgId: string, id: string, input: Partial<CustomerInput>) {
  await getCustomer(orgId, id); // 404 if not in this org
  return prisma.customer.update({ where: { id }, data: input });
}

export async function deleteCustomer(orgId: string, id: string) {
  await getCustomer(orgId, id);
  const invoiceCount = await prisma.invoice.count({ where: { customerId: id } });
  if (invoiceCount > 0) {
    const err = new Error("customer has invoices — archive instead of deleting") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  await prisma.customer.delete({ where: { id } });
  return { deleted: true };
}

export function notFound(message: string) {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 404;
  return err;
}
