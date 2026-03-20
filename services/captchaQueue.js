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

if (REDIS_URL) {
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      console.log(`🔄 BullMQ Redis retry attempt ${times}, retrying in ${delay}ms...`);
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND"];
      if (targetErrors.some(e => err.message.includes(e))) {
        console.log("🔄 BullMQ Redis reconnecting due to connection error...");
        return true;
      }
      return false;
    },
    tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
  });

  connection.on("connect", () => {
    isQueueAvailable = true;
    queueErrorCount = 0;
    console.log("✅ BullMQ Redis Connected");
  });

  connection.on("ready", () => {
    isQueueAvailable = true;
    console.log("✅ BullMQ Redis Ready");
  });

  connection.on("error", (err) => {
    queueErrorCount++;
    isQueueAvailable = false;
    console.error("❌ BullMQ Redis Error:", err.message);
    console.error("   Error Code:", err.code || "N/A");

    if (err.code === "ENOTFOUND") {
      console.error("   💡 Hostname not found. Check your REDIS_URL environment variable.");
    } else if (err.code === "ECONNREFUSED") {
      console.error("   💡 Connection refused. Is Redis running and accessible?");
    }
  });

  connection.on("close", () => {
    isQueueAvailable = false;
    console.log("⚠️  BullMQ Redis connection closed");
  });

  connection.on("reconnecting", () => {
    console.log("🔄 BullMQ Redis reconnecting...");
  });
} else {
  console.warn("⚠️  Running without Redis - BullMQ features will be disabled");
}

// Create queue with error handling
let captchaQueue = null;

if (connection) {
  try {
    captchaQueue = new Queue("captcha", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });

    captchaQueue.on("error", (error) => {
      console.error("❌ Captcha Queue Error:", error.message);
    });
  } catch (error) {
    console.error("❌ Failed to create Captcha Queue:", error.message);
  }
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
  return isQueueAvailable && connection && connection.status === "ready";
}

module.exports = {
  captchaQueue,
  connection,
  isQueueHealthy,
  safeQueueOperation,
  isQueueAvailable: () => isQueueAvailable,
};
