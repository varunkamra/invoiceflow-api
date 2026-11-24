import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerUser, loginUser } from "../services/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation failed", details: parsed.error.flatten() });
    }
    const { user, org, token } = await registerUser(parsed.data);
    return reply.code(201).send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: org.id, name: org.name, slug: org.slug },
    });
  });

  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation failed", details: parsed.error.flatten() });
    }
    const result = await loginUser(parsed.data);
    return result;
  });
}
