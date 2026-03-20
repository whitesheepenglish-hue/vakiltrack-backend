require("../config/loadEnv");

const { Queue } = require("bullmq");
const { redis, redisConfig, waitForRedis } = require("./redis");

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error("❌ REDIS_URL is missing - BullMQ features disabled");
}

// Use shared Redis connection - NO DUPLICATE CONNECTION
const connection = redis;
let isQueueAvailable = false;
let queueErrorCount = 0;

if (connection) {
  // Monitor shared connection status
  connection.on("ready", () => {
    isQueueAvailable = true;
    queueErrorCount = 0;
  });

  connection.on("error", () => {
    isQueueAvailable = false;
    queueErrorCount++;
  });

  connection.on("close", () => {
    isQueueAvailable = false;
  });
}

// Create queue with error handling - only after connection is ready
let captchaQueue = null;
let queueInitialized = false;

async function initializeQueue() {
  if (!connection || queueInitialized) return;

  // Wait for connection to be ready before creating Queue
  if (connection.status !== "ready") {
    console.log("⏳ Waiting for Redis connection before creating BullMQ Queue...");
    await new Promise((resolve) => {
      const checkReady = () => {
        if (connection.status === "ready") {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  try {
    console.log("🚀 Creating BullMQ Queue...");
    captchaQueue = new Queue("captcha", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 5, // Keep last 5 failed jobs
      },
    });

    queueInitialized = true;
    console.log("✅ BullMQ Queue created successfully");

    captchaQueue.on("error", (error) => {
      console.error("❌ Captcha Queue Error:", error.message);
    });

    captchaQueue.on("waiting", (job) => {
      // Suppress verbose waiting logs
    });

  } catch (error) {
    console.error("❌ Failed to create Captcha Queue:", error.message);
    queueInitialized = false;
  }
}

// Start queue initialization
if (connection) {
  initializeQueue();
}

// Graceful queue operations
async function safeQueueOperation(operation, fallback = null) {
  if (!isQueueAvailable || !captchaQueue) {
    console.warn("⚠️  Queue not available, using fallback");
    return fallback;
  }

  try {
    return await operation();
  } catch (error) {
    console.error("❌ Queue operation failed:", error.message);
    return fallback;
  }
}

function isQueueHealthy() {
  return isQueueAvailable && queueInitialized && connection?.status === "ready";
}

// Wait for queue to be ready
async function waitForQueue(timeoutMs = 30000) {
  const start = Date.now();
  while (!isQueueHealthy()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timeout waiting for queue to be ready");
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return captchaQueue;
}

module.exports = {
  captchaQueue,
  connection,
  isQueueHealthy,
  safeQueueOperation,
  isQueueAvailable: () => isQueueAvailable,
  waitForQueue,
};
