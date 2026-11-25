import { hash } from "../services/crypto.js";
import { prisma } from "../lib/prisma.js";

/**
 * Seed demo data so the repo demos instantly:
 *   npm run db:seed
 *
 * Creates one org with two members, three customers, and a handful of
 * invoices in various states. Idempotent — skips if the demo org exists.
 */
const DEMO_EMAIL = "demo@invoiceflow.dev";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log("seed: demo user already exists — skipping");
    return;
  }

  const passwordHash = await hash("demo-password");
  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: DEMO_EMAIL, passwordHash, name: "Demo Owner" },
    });
    const org = await tx.organization.create({
      data: { name: "Acme Studio", slug: "acme-studio-demo" },
    });
    await tx.member.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    return { user, org };
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: { organizationId: org.id, name: "Northwind Traders", email: "ap@northwind.test", country: "US" },
    }),
    prisma.customer.create({
      data: { organizationId: org.id, name: "Contoso Ltd", email: "accounts@contoso.test", country: "GB" },
    }),
    prisma.customer.create({
      data: { organizationId: org.id, name: "Globex Corp", email: "billing@globex.test", country: "DE" },
    }),
  ]);

  const inMonth = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // PAID invoice
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: "INV-2026-0001",
      customerId: customers[0].id,
      status: "PAID",
      dueDate: inMonth(-10),
      subtotalCents: 150000,
      totalCents: 150000,
      paidAt: new Date(),
      items: { create: [{ description: "Brand identity design", quantity: 1, unitPriceCents: 150000, totalCents: 150000 }] },
    },
  });

  // OPEN invoice
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: "INV-2026-0002",
      customerId: customers[1].id,
      status: "OPEN",
      dueDate: inMonth(7),
      subtotalCents: 69800,
      taxBps: 1000,
      taxCents: 6980,
      totalCents: 76780,
      items: {
        create: [
          { description: "Website hosting (2 months)", quantity: 2, unitPriceCents: 9900, totalCents: 19800 },
          { description: "Custom integration", quantity: 1, unitPriceCents: 50000, totalCents: 50000 },
        ],
      },
    },
  });

  // DRAFT invoice
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: "INV-2026-0003",
      customerId: customers[2].id,
      status: "DRAFT",
      dueDate: inMonth(14),
      subtotalCents: 30000,
      totalCents: 30000,
      items: { create: [{ description: "API consulting (hours)", quantity: 6, unitPriceCents: 5000, totalCents: 30000 }] },
    },
  });

  console.log(`seed: created org "${org.name}" (slug: ${org.slug})`);
  console.log(`seed: login with ${DEMO_EMAIL} / demo-password`);
  console.log(`seed: ${customers.length} customers, 3 invoices (PAID/OPEN/DRAFT)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
