const { Worker } = require("bullmq");
const scrapeCase = require("../scrapers/ecourtScraper");
const { captchaQueue, connection } = require("../services/captchaQueue");

const { getCachedCaptchaSession } = scrapeCase;
const CAPTCHA_POOL_INTERVAL_MS = 2000;
const CAPTCHA_POOL_TARGET = 3;
const workerLabel = `captcha-worker:${process.env.CAPTCHA_WORKER_INDEX || process.pid}`;

const captchaWorker = new Worker(
  "captcha",
  async (job) => {
    const caseNumber = String(job.data?.caseNumber || "").trim();
    return getCachedCaptchaSession(caseNumber);
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

setInterval(async () => {
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

module.exports = captchaWorker;
