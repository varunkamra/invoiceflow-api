import { startWorkers } from "./workers.js";
import { overdueQueue, OVERDUE_SWEEP_JOB } from "./queues.js";

/**
 * Worker process entrypoint — `npm run worker`.
 *
 * Idempotently registers the daily overdue-sweep repeatable job,
 * then starts all workers. The API process never runs this —
 * it only enqueues.
 */
async function main() {
  // Register the repeatable sweep: daily at 06:00 UTC. upsert-style:
  // adding a repeatable job with the same key replaces (not duplicates) it.
  await overdueQueue.add(
    OVERDUE_SWEEP_JOB,
    {},
    {
      repeat: { pattern: "0 6 * * *", tz: "UTC" },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    }
  );

  const workers = startWorkers();

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
