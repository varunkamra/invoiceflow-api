import { hash, compare } from "./crypto.js";
import { prisma } from "../lib/prisma.js";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string;
  orgId: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
}

export async function registerUser(input: { email: string; password: string; name: string; orgName: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    const err = new Error("email already registered") as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hash(input.password);

  // User + Organization + OWNER membership created atomically
  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, passwordHash, name: input.name },
    });
    const org = await tx.organization.create({
      data: { name: input.orgName, slug: await uniqueSlug(input.orgName) },
    });
    await tx.member.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    return { user, org };
  });

  return { user, org, token: signToken({ sub: user.id, orgId: org.id, role: "OWNER" }) };
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: true },
  });
  if (!user || !(await compare(input.password, user.passwordHash))) {
    const err = new Error("invalid email or password") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }

  // JWT carries the active org; multi-org users switch via a future /auth/switch endpoint
  const membership = user.memberships[0];
  if (!membership) {
    const err = new Error("no organization membership") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  return {
    token: signToken({ sub: user.id, orgId: membership.organizationId, role: membership.role }),
    user: { id: user.id, email: user.email, name: user.name },
  };
}

function signToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "12h" });
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/**
 * Slugify the org name, then dedupe against existing orgs: "Acme" → "acme",
 * second "Acme" → "acme-2" (or "-3", …). Retry loop handles concurrent
 * registration of the same name; the DB unique constraint is the final backstop.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "org";
  let n = 1;
  for (;;) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const clash = await prisma.organization.findUnique({ where: { slug } });
    if (!clash) return slug;
    n++;
  }
}
