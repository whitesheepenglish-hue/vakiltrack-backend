const { Worker } = require("bullmq");
const scrapeCase = require("../scrapers/ecourtScraper");
const { getCaptchaQueue, connection, isQueueHealthy, waitForQueue } = require("../services/captchaQueue");

const { createCaptchaSession } = scrapeCase;
const CAPTCHA_POOL_INTERVAL_MS = 5000; // Increased to reduce load
const CAPTCHA_POOL_TARGET = 3;
const workerLabel = `captcha-worker:${process.env.CAPTCHA_WORKER_INDEX || process.pid}`;

let captchaWorker = null;
let workerInitialized = false;

// Initialize worker with proper connection check
async function initializeWorker() {
  if (!connection) {
    console.warn(`[${workerLabel}] ⚠️  Redis not available - Captcha Worker disabled`);
    return;
  }

  if (workerInitialized) return;

  try {
    // Wait for connection to be ready
    console.log(`[${workerLabel}] ⏳ Waiting for Redis connection...`);
    await waitForQueue(60000);

    console.log(`[${workerLabel}] 🚀 Creating BullMQ Worker...`);
    captchaWorker = new Worker(
      "captcha",
      async (job) => {
        const caseNumber = String(job.data?.caseNumber || "").trim();
        return await createCaptchaSession(caseNumber);
      },
      {
        connection,
        concurrency: 3, // Reduced concurrency to prevent overload
        lockDuration: 30000, // 30s lock duration
        stalledInterval: 30000, // Check stalled jobs every 30s
      },
    );

    workerInitialized = true;
    console.log(`[${workerLabel}] ✅ Worker created successfully`);

    captchaWorker.on("completed", (job) => {
      console.log(`[${workerLabel}] Captcha job ${job.id} completed`);
    });

    captchaWorker.on("failed", (job, error) => {
      console.error(`[${workerLabel}] Captcha job ${job?.id || "unknown"} failed:`, error?.message || error);
    });

    captchaWorker.on("error", (error) => {
      console.error(`[${workerLabel}] Worker error:`, error?.message || error);
    });

  } catch (error) {
    console.error(`[${workerLabel}] ❌ Failed to create worker:`, error.message);
  }
}

// Start initialization
initializeWorker();

// Pool refill interval with health check - delayed start to avoid race condition
let poolInterval = null;

async function startPoolRefill() {
  // Wait for worker to be ready
  while (!workerInitialized) {
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[${workerLabel}] 🔄 Starting captcha pool refill interval`);

  poolInterval = setInterval(async () => {
    const captchaQueue = getCaptchaQueue();

    // Skip if queue is not healthy
    if (!isQueueHealthy() || !captchaQueue) {
      return; // Silently skip without spamming logs
    }

    try {
      const counts = await captchaQueue.getJobCounts("waiting", "active", "delayed");
      const queuedJobs = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);

      if (queuedJobs >= CAPTCHA_POOL_TARGET) {
        return;
      }

      await captchaQueue.add("generate", { caseNumber: "" });
    } catch (error) {
      // Only log errors that aren't connection-related spam
      if (error.code !== "ECONNRESET" && error.code !== "ETIMEDOUT") {
        console.error(`[${workerLabel}] Captcha pool refill failed:`, error?.message || error);
      }
    }
  }, CAPTCHA_POOL_INTERVAL_MS);
}

// Start pool refill after worker is ready
startPoolRefill();

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`[${workerLabel}] Shutting down worker (${signal})...`);

  try {
    if (poolInterval) {
      clearInterval(poolInterval);
    }
    if (captchaWorker) {
      await captchaWorker.close();
    }
  } catch (err) {
    console.error(`[${workerLabel}] Error during shutdown:`, err.message);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = captchaWorker;
