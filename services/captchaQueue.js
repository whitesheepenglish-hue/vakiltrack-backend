require("../config/loadEnv");

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;

// Validate Redis URL
if (!REDIS_URL) {
  console.error("❌ REDIS_URL is missing in environment variables");
  console.error("   Please set REDIS_URL in your .env file or environment");
}

// Parse Redis URL for diagnostics
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || 6379,
      protocol: parsed.protocol,
      isTLS: url.startsWith("rediss://"),
    };
  } catch (error) {
    console.error("❌ Invalid REDIS_URL format:", error.message);
    return null;
  }
}

// Check if hostname looks like an internal Render name without domain
function isLikelyIncompleteHostname(hostname) {
  return hostname && hostname.match(/^red-[a-z0-9]+$/) !== null;
}

const parsedUrl = REDIS_URL ? parseRedisUrl(REDIS_URL) : null;

if (parsedUrl) {
  console.log("🔧 BullMQ Redis Configuration:");
  console.log(`   Host: ${parsedUrl.host}`);
  console.log(`   Port: ${parsedUrl.port}`);
  console.log(`   TLS: ${parsedUrl.isTLS ? "Yes" : "No"}`);

  if (isLikelyIncompleteHostname(parsedUrl.host)) {
    console.warn("⚠️  Warning: Redis hostname looks like an internal service name.");
    console.warn("   Expected format: redis://[user:pass@]hostname:port");
  }
}

// Create Redis connection with resilience settings
let connection = null;
let isQueueAvailable = false;
let queueErrorCount = 0;
let isConnectionReady = false;

if (REDIS_URL) {
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true, // IMPORTANT: Required for BullMQ to work correctly
    enableOfflineQueue: false,
    lazyConnect: false, // Connect immediately so BullMQ can use it
    keepAlive: 30000, // Send keepalive every 30 seconds to prevent idle timeout
    connectTimeout: 30000, // 30 seconds connection timeout for cloud Redis
    commandTimeout: 10000, // 10 seconds command timeout
    retryStrategy(times) {
      const delay = Math.min(times * 200, 10000);
      console.log(`🔄 BullMQ Redis retry attempt ${times}, retrying in ${delay}ms...`);
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EPIPE", "ECONNABORTED"];
      const errMsg = err.message || err.code || "";
      if (targetErrors.some(e => errMsg.includes(e))) {
        console.log(`🔄 BullMQ Redis will reconnect due to: ${errMsg}`);
        return true;
      }
      return false;
    },
    tls: REDIS_URL.startsWith("rediss://") ? {
      rejectUnauthorized: false
    } : undefined,
  });

  connection.on("connect", () => {
    queueErrorCount = 0;
    console.log("✅ BullMQ Redis Connected");
  });

  connection.on("ready", () => {
    isQueueAvailable = true;
    isConnectionReady = true;
    console.log("✅ BullMQ Redis Ready - Queue is now available");
  });

  connection.on("error", (err) => {
    queueErrorCount++;
    isQueueAvailable = false;
    console.error("❌ BullMQ Redis Error:", err.message);
    console.error("   Error Code:", err.code || err.errno || "N/A");

    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      console.error("   💡 Hostname not found. Check your REDIS_URL environment variable.");
    } else if (err.code === "ECONNREFUSED") {
      console.error("   💡 Connection refused. Is Redis running and accessible?");
    } else if (err.code === "ECONNRESET" || err.code === "EPIPE") {
      console.error("   💡 Connection reset. Redis server closed connection. Keepalive is enabled to prevent this.");
    }
  });

  connection.on("close", () => {
    isQueueAvailable = false;
    isConnectionReady = false;
    console.log("⚠️  BullMQ Redis connection closed");
  });

  connection.on("reconnecting", () => {
    isQueueAvailable = false;
    console.log("🔄 BullMQ Redis reconnecting...");
  });
} else {
  console.warn("⚠️  Running without Redis - BullMQ features will be disabled");
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
  return isQueueAvailable && queueInitialized && connection && connection.status === "ready";
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
  initializeQueue,
  waitForQueue,
};
