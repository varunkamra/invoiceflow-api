import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/auth" });
  // await app.register(orgRoutes,    { prefix: "/org" });
  // await app.register(customerRoutes, { prefix: "/customers" });
  // await app.register(invoiceRoutes,  { prefix: "/invoices" });
  // await app.register(paymentRoutes,  { prefix: "/payments" });
  // await app.register(stripeWebhookRoute); // /webhooks/stripe — raw body!
}
