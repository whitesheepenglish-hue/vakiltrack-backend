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
  connection.on("connect", () => {
    console.log("📡 Redis 'connect' event - Queue connection established");
    isQueueAvailable = true;
    queueErrorCount = 0;
  });

  connection.on("ready", () => {
    console.log("✅ Redis 'ready' event - Queue fully ready");
    isQueueAvailable = true;
    queueErrorCount = 0;
  });

  connection.on("error", (err) => {
    isQueueAvailable = false;
    queueErrorCount++;
    console.error("❌ Queue Redis error:", err.message);
  });

  connection.on("close", () => {
    isQueueAvailable = false;
    console.log("⚠️  Queue Redis connection closed");
  });
  
  connection.on("reconnecting", () => {
    console.log("🔄 Queue Redis reconnecting...");
  });
  
  // Set initial state based on current connection status
  const currentStatus = connection.status;
  isQueueAvailable = currentStatus === "ready" || currentStatus === "connect";
}

// Create queue with error handling - only after connection is ready
let captchaQueue = null;
let queueInitialized = false;

function getCaptchaQueue() {
  return captchaQueue;
}

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

// Start queue initialization with proper error handling
if (connection) {
  initializeQueue().catch(err => {
    console.error("❌ Queue initialization failed:", err.message);
  });
} else {
  console.warn("⚠️  No Redis connection available - BullMQ queue disabled");
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
  if (!captchaQueue) return false;
  if (!queueInitialized) return false;
  
  // Check Redis connection status
  const redisStatus = connection?.status;
  const isRedisReady = redisStatus === "ready" || redisStatus === "connect";
  
  // Queue is healthy if Redis is ready and queue was initialized
  // We don't strictly require isQueueAvailable flag since it depends on events
  return isRedisReady;
}

// Test if queue can actually perform operations
async function testQueueHealth() {
  const queue = getCaptchaQueue();
  if (!queue) return false;
  try {
    // Try to get job counts as a health check
    await queue.getJobCounts("waiting", "active", "completed", "failed");
    return true;
  } catch (error) {
    console.error("❌ Queue health test failed:", error.message);
    return false;
  }
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
  return getCaptchaQueue();
}

module.exports = {
  connection,
  getCaptchaQueue,
  isQueueHealthy,
  testQueueHealth,
  safeQueueOperation,
  isQueueAvailable: () => isQueueAvailable,
  waitForQueue,
};
