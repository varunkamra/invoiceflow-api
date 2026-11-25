import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const connection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null, // BullMQ requirement: workers block indefinitely
};

/**
 * Invoice queue — handles per-invoice async work.
 *
 * Job types (discriminated by `name`):
 *  - send-invoice   { invoiceId }   render PDF, email to customer
 *  - send-reminder  { invoiceId }   overdue reminder email
 */
export const invoiceQueue = new Queue("invoice", { connection });

/** Overdue sweep — repeatable cron job (see jobs/scheduler.ts). */
export const OVERDUE_SWEEP_JOB = "overdue-sweep";

export const overdueQueue = new Queue("overdue", { connection });
