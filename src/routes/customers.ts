import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../plugins/auth.js";
import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from "../services/customers.js";

const customerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).optional(), // ISO alpha-2
  taxId: z.string().max(50).optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = z
      .object({ search: z.string().optional(), limit: z.coerce.number().max(100).default(20), offset: z.coerce.number().min(0).default(0) })
      .parse(req.query);
    const [customers, total] = await listCustomers(req.auth!.organizationId, q);
    return { data: customers, total };
  });

  app.get("/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return getCustomer(req.auth!.organizationId, id);
  });

  app.post("/", async (req, reply) => {
    requireRole(req, "ADMIN");
    const body = customerSchema.parse(req.body);
    const customer = await createCustomer(req.auth!.organizationId, body);
    return reply.code(201).send(customer);
  });

  app.patch("/:id", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = customerSchema.partial().parse(req.body);
    return updateCustomer(req.auth!.organizationId, id, body);
  });

  app.delete("/:id", async (req) => {
    requireRole(req, "ADMIN");
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    return deleteCustomer(req.auth!.organizationId, id);
  });
}
