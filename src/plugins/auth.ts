import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("auth");

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Public routes opt out via config.url — keep this simple, add a skip-list later
    const publicPaths = ["/health", "/docs", "/auth/login", "/auth/register", "/webhooks/stripe"];
    if (publicPaths.some((p) => req.url.startsWith(p))) return;

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing bearer token" });
    }
    let payload: { sub: string; orgId: string; role: AuthContext["role"] };
    try {
      payload = jwt.verify(header.slice(7), env.JWT_SECRET) as typeof payload;
    } catch {
      return reply.code(401).send({ error: "invalid or expired token" });
    }
    req.auth = { userId: payload.sub, organizationId: payload.orgId, role: payload.role };
  });
}

/** Require a minimum role; call inside a route handler. Throws if insufficient. */
export function requireRole(req: FastifyRequest, min: AuthContext["role"]) {
  const rank = { VIEWER: 0, ADMIN: 1, OWNER: 2 };
  if (!req.auth || rank[req.auth.role] < rank[min]) {
    const err = new Error("insufficient role") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}
