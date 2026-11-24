import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { customerRoutes } from "./customers.js";
import { invoiceRoutes } from "./invoices.js";
import { webhookRoutes } from "./webhooks.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/auth" });
  // await app.register(orgRoutes,    { prefix: "/org" });
  await app.register(customerRoutes, { prefix: "/customers" });
  await app.register(invoiceRoutes, { prefix: "/invoices" });
  // await app.register(paymentRoutes,  { prefix: "/payments" });
  await app.register(webhookRoutes, { prefix: "/webhooks" }); // raw body, signature-verified
}
