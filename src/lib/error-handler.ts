import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(err: AppError, req: FastifyRequest, reply: FastifyReply) {
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 500) req.log.error(err);
  reply.code(statusCode).send({
    error: statusCode >= 500 ? "internal server error" : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
