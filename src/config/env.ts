import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  RAZORPAY_KEY_ID: z.string().startsWith("rzp_"),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

const parsed = envSchema.parse(process.env);

// Payment credentials may be placeholders in dev/compose; real verification
// happens per-operation in the payments service. Fail hard only on core infra.
if (parsed.RAZORPAY_KEY_ID.includes("placeholder")) {
  console.warn("⚠ RAZORPAY keys are placeholders — payment endpoints will return 503 until configured");
}

export const env = parsed;
export const paymentsConfigured = !parsed.RAZORPAY_KEY_ID.includes("placeholder");
export const isProd = env.NODE_ENV === "production";
