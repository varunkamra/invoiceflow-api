import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { renderInvoicePdf } from "../lib/pdf.js";
import { sendEmail } from "../services/email.js";
import { connection, invoiceQueue, overdueQueue, OVERDUE_SWEEP_JOB } from "./queues.js";

/**
 * Worker process — runs separately from the API (see jobs/entry.ts).
 *
 * Why a separate process: PDF rendering and email I/O are slow and can block.
 * The API just enqueues jobs (fast, Redis round-trip) and stays responsive;
 * workers churn through the backlog independently. BullMQ gives us retries,
 * backoff, and visibility (job states) out of the box.
 */

const REMINDER_THROTTLE_MS = 3 * 24 * 60 * 60 * 1000; // at most one reminder per 3 days

async function processSendInvoice(job: Job<{ invoiceId: string }>) {
  const { invoiceId } = job.data;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, status: "OPEN" },
    include: {
      items: true,
      customer: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
  });
  if (!invoice) throw new Error(`invoice ${invoiceId} not found or not OPEN`);

  const pdf = await renderInvoicePdf({
    number: invoice.number,
    status: invoice.status,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    notes: invoice.notes,
    organizationName: invoice.organization.name,
    customer: invoice.customer,
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: i.quantity.toNumber(),
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    })),
  });

  const result = await sendEmail({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.number} from ${invoice.organization.name}`,
    html: `<p>Hi ${invoice.customer.name},</p>
<p>Please find invoice <strong>${invoice.number}</strong> attached.
Total due: <strong>${(invoice.totalCents / 100).toFixed(2)} ${invoice.currency.toUpperCase()}</strong>,
due by ${invoice.dueDate.toISOString().slice(0, 10)}.</p>
<p>You can pay online via the payment link sent separately, or reply to this email with questions.</p>`,
    attachment: { filename: `${invoice.number}.pdf`, content: pdf },
  });

  await prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      organizationId: invoice.organizationId,
      action: "invoice.sent",
      resourceType: "invoice",
      resourceId: invoiceId,
      metadata: { emailed: result.sent },
    },
  });

  return { emailed: result.sent };
}

async function processSendReminder(job: Job<{ invoiceId: string }>) {
  const { invoiceId } = job.data;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, status: "OPEN" },
    include: {
      customer: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
  });
  if (!invoice) return { skipped: "not open" };

  // Throttle: at most one reminder per REMINDER_THROTTLE_MS
  if (invoice.lastReminderAt && Date.now() - invoice.lastReminderAt.getTime() < REMINDER_THROTTLE_MS) {
    return { skipped: "throttled" };
  }

  await sendEmail({
    to: invoice.customer.email,
    subject: `Reminder: invoice ${invoice.number} is overdue`,
    html: `<p>Hi ${invoice.customer.name},</p>
<p>This is a friendly reminder that invoice <strong>${invoice.number}</strong>
(${(invoice.totalCents / 100).toFixed(2)} ${invoice.currency.toUpperCase()})
was due on ${invoice.dueDate.toISOString().slice(0, 10)} and is now overdue.</p>
<p>If you have already paid, please disregard this email.</p>`,
  });

  await prisma.invoice.update({ where: { id: invoiceId }, data: { lastReminderAt: new Date() } });
  return { sent: true };
}

/**
 * Daily overdue sweep — runs across ALL organizations:
 *  - marks OPEN invoices past due+30d as UNCOLLECTIBLE
 *  - enqueues reminders for OPEN invoices past due (respecting throttle)
 * Returns a summary instead of throwing, so a partial failure doesn't
 * re-run the whole sweep on BullMQ's retry.
 */
async function processOverdueSweep(job: Job) {
  const now = new Date();
  const uncollectibleCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const marked = await prisma.invoice.updateMany({
    where: { status: "OPEN", dueDate: { lt: uncollectibleCutoff } },
    data: { status: "UNCOLLECTIBLE" },
  });

  const overdue = await prisma.invoice.findMany({
    where: { status: "OPEN", dueDate: { lt: now } },
    select: { id: true },
  });

  let reminders = 0;
  for (const inv of overdue) {
    const existing = await invoiceQueue.getJob(`reminder-${inv.id}`);
    if (!existing) {
      await invoiceQueue.add("send-reminder", { invoiceId: inv.id }, {
        jobId: `reminder-${inv.id}`, // dedupe: one pending reminder per invoice
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      });
      reminders++;
    }
  }

  job.log(`sweep: marked ${marked.count} uncollectible, queued ${reminders} reminders`);
  return { markedUncollectible: marked.count, remindersQueued: reminders };
}

const workers = [
  new Worker("invoice", async (job) => {
    if (job.name === "send-invoice") return processSendInvoice(job);
    if (job.name === "send-reminder") return processSendReminder(job);
    throw new Error(`unknown job name: ${job.name}`);
  }, { connection, concurrency: 5, removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } }),

  new Worker("overdue", processOverdueSweep, {
    connection,
    concurrency: 1,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  }),
];

export function startWorkers() {
  for (const w of workers) {
    w.on("completed", (job) => console.log(`[worker] ${job.queueName}:${job.name} completed`));
    w.on("failed", (job, err) => console.error(`[worker] ${job?.queueName}:${job?.name} failed: ${err.message}`));
  }
  console.log("[worker] workers started (invoice, overdue)");
  return workers;
}

export async function closeWorkers() {
  await Promise.all(workers.map((w) => w.close()));
}

export { invoiceQueue, overdueQueue, OVERDUE_SWEEP_JOB };
