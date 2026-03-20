const { Worker } = require("bullmq");
const scrapeCase = require("../scrapers/ecourtScraper");
const { captchaQueue, connection, isQueueHealthy } = require("../services/captchaQueue");

const { createCaptchaSession } = scrapeCase;
const CAPTCHA_POOL_INTERVAL_MS = 2000;
const CAPTCHA_POOL_TARGET = 3;
const workerLabel = `captcha-worker:${process.env.CAPTCHA_WORKER_INDEX || process.pid}`;

let captchaWorker = null;

// Only create worker if connection is available
if (connection) {
  captchaWorker = new Worker(
    "captcha",
    async (job) => {
      const caseNumber = String(job.data?.caseNumber || "").trim();
      return await createCaptchaSession(caseNumber);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  captchaWorker.on("completed", (job) => {
    console.log(`[${workerLabel}] Captcha job ${job.id} completed`);
  });

  captchaWorker.on("failed", (job, error) => {
    console.error(`[${workerLabel}] Captcha job ${job?.id || "unknown"} failed:`, error?.message || error);
  });

  captchaWorker.on("error", (error) => {
    console.error(`[${workerLabel}] Worker error:`, error?.message || error);
  });
} else {
  console.warn(`[${workerLabel}] ⚠️  Redis not available - Captcha Worker disabled`);
}

// Pool refill interval with health check
const poolInterval = setInterval(async () => {
  // Skip if queue is not healthy
  if (!isQueueHealthy() || !captchaQueue) {
    console.warn(`[${workerLabel}] ⚠️  Queue not healthy, skipping pool refill`);
    return;
  }

  try {
    const counts = await captchaQueue.getJobCounts("waiting", "active", "delayed");
    const queuedJobs = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);

    if (queuedJobs >= CAPTCHA_POOL_TARGET) {
      return;
    }

    await captchaQueue.add("generate", { caseNumber: "" });
  } catch (error) {
    console.error(`[${workerLabel}] Captcha pool refill failed:`, error?.message || error);
  }
}, CAPTCHA_POOL_INTERVAL_MS);

// Graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log(`[${workerLabel}] Shutting down worker...`);
  clearInterval(poolInterval);

  if (captchaWorker) {
    await captchaWorker.close();
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log(`[${workerLabel}] Shutting down worker (SIGINT)...`);
  clearInterval(poolInterval);

  if (captchaWorker) {
    await captchaWorker.close();
  }
  process.exit(0);
});

module.exports = captchaWorker;
