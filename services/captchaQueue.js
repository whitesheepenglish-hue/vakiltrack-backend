require("../config/loadEnv");

const { Queue } = require("bullmq");
const { redis, waitForRedis } = require("./redis");

const REDIS_URL = String(process.env.REDIS_URL || "").trim();

if (!REDIS_URL) {
  console.error("REDIS_URL is missing - BullMQ features disabled");
}

const connection = redis;
let captchaQueue = null;
let queueInitialized = false;
let initializePromise = null;
let lastQueueError = null;

function getCaptchaQueue() {
  return captchaQueue;
}

async function initializeQueue() {
  if (!connection) {
    console.error("Redis connection not available for BullMQ");
    return null;
  }

  if (captchaQueue && queueInitialized) {
    return captchaQueue;
  }

  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    try {
      await waitForRedis(30000);

      if (!captchaQueue) {
        captchaQueue = new Queue("captcha", {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        });

        captchaQueue.on("error", (error) => {
          lastQueueError = error;
          console.error("Captcha queue error:", error.message);
        });
      }

      queueInitialized = true;
      lastQueueError = null;
      return captchaQueue;
    } catch (error) {
      console.error("Queue initialization failed:", error.message);
      lastQueueError = error;
      return null;
    }
  })();

  return initializePromise;
}

if (connection) {
  initializeQueue().catch((error) => {
    lastQueueError = error;
    console.error("Queue initialization failed:", error.message);
  });
}

async function safeQueueOperation(operation, fallback = null) {
  try {
    const queue = await initializeQueue();
    if (!queue) {
      return fallback;
    }
    return await operation(queue);
  } catch (error) {
    lastQueueError = error;
    console.error("Queue operation failed:", error.message);
    return fallback;
  }
}

function isQueueHealthy() {
  if (!captchaQueue || !queueInitialized) {
    return false;
  }

  if (lastQueueError) {
    return false;
  }

  return connection?.status === "ready";
}

async function testQueueHealth() {
  const queue = await initializeQueue().catch(() => null);
  if (!queue) return false;

  try {
    await queue.getJobCounts("waiting", "active", "completed", "failed");
    lastQueueError = null;
    return true;
  } catch (error) {
    lastQueueError = error;
    console.error("Queue health test failed:", error.message);
    return false;
  }
}

async function waitForQueue(timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const queue = await initializeQueue().catch(() => null);
    if (queue && await testQueueHealth()) {
      return queue;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timeout waiting for queue to be ready");
}

module.exports = {
  connection,
  getCaptchaQueue,
  initializeQueue,
  isQueueHealthy,
  testQueueHealth,
  safeQueueOperation,
  waitForQueue,
};
