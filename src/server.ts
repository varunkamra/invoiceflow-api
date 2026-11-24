import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { registerRoutes } from "./routes/index.js";
import { errorHandler } from "./lib/error-handler.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport: env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "InvoiceFlow API",
        description: "Multi-tenant invoicing SaaS API with Stripe subscriptions",
        version: "1.0.0",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(authPlugin);
  app.setErrorHandler(errorHandler);

  app.get("/health", async () => ({ status: "ok" }));

  await registerRoutes(app);

  return app;
}

// Only auto-start when run directly (tests import buildApp instead)
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  buildApp()
    .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
