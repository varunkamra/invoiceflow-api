import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(err: AppError | ZodError, req: FastifyRequest, reply: FastifyReply) {
  // Zod validation errors thrown from .parse() are client errors, not 500s
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "validation failed", details: err.flatten() });
  }
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 500) req.log.error(err);
  reply.code(statusCode).send({
    error: statusCode >= 500 ? "internal server error" : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
