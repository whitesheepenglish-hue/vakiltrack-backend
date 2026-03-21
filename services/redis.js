require("../config/loadEnv");

const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Parse Redis URL for diagnostics
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || 6379,
      protocol: parsed.protocol,
      hasPassword: !!parsed.password,
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

const parsedUrl = parseRedisUrl(REDIS_URL);

if (parsedUrl) {
  console.log("🔧 Redis Configuration:");
  console.log(`   Host: ${parsedUrl.host}`);
  console.log(`   Port: ${parsedUrl.port}`);
  console.log(`   TLS: ${parsedUrl.isTLS ? "Yes" : "No"}`);
  console.log(`   Auth: ${parsedUrl.hasPassword ? "Yes" : "No"}`);

  if (isLikelyIncompleteHostname(parsedUrl.host)) {
    console.warn("⚠️  Warning: Redis hostname looks like an internal service name.");
    console.warn("   On Render, use the external URL format: redis://red-xxxx:password@host.render.com:6379");
  }
}

// SINGLE SHARED Redis configuration
// All modules should use this same connection to avoid duplicate connections
const redisConfig = {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility
  enableReadyCheck: true,
  enableOfflineQueue: true, // Allow queueing commands while connecting
  lazyConnect: true, // Connect on first command - more stable for cloud Redis
  keepAlive: 30000, // Keep connection alive
  connectTimeout: 30000, // 30s for cloud Redis
  commandTimeout: 10000,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 10000);
    console.log(`🔄 Redis retry attempt ${times}, next in ${delay}ms...`);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EPIPE", "ECONNABORTED"];
    const errMsg = err.message || err.code || "";
    const shouldReconnect = targetErrors.some(e => errMsg.includes(e));
    if (shouldReconnect) {
      console.log(`🔄 Redis will reconnect due to: ${errMsg}`);
    }
    return shouldReconnect;
  },
  tls: REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
};

// Create SINGLE shared Redis connection
let redis = null;
let isConnected = false;
let isReady = false;
let connectionErrors = 0;

if (REDIS_URL) {
  redis = new IORedis(REDIS_URL, redisConfig);

  redis.on("connect", () => {
    isConnected = true;
    connectionErrors = 0;
    console.log("✅ Redis connected");
  });

  redis.on("ready", () => {
    isReady = true;
    console.log("✅ Redis ready");
  });

  redis.on("error", (err) => {
    connectionErrors++;
    // Only log non-spam errors
    if (err.code !== "ECONNRESET" && err.code !== "ETIMEDOUT") {
      console.error("❌ Redis Error:", err.message);
      if (err.code === "ENOTFOUND") {
        console.error("💡 Check REDIS_URL environment variable");
      }
    }
  });

  redis.on("close", () => {
    isConnected = false;
    isReady = false;
    console.log("⚠️  Redis connection closed");
  });

  redis.on("reconnecting", () => {
    console.log("🔄 Redis reconnecting...");
  });
} else {
  console.error("❌ REDIS_URL not set. Redis is disabled.");
}

// Health check - more lenient to account for lazyConnect and various states
function isRedisHealthy() {
  if (!redis) return false;
  
  // Check ioredis status (can be: wait, connecting, connect, ready, close, end)
  const status = redis.status;
  
  // If we're connected or ready, consider it healthy
  const isHealthy = status === "ready" || status === "connect" || (isConnected && isReady);
  
  return isHealthy;
}

// Ping Redis to verify actual connectivity
async function pingRedis() {
  if (!redis) return false;
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    return false;
  }
}

// Safe operations
async function safeRedisOperation(operation, fallback = null) {
  if (!isRedisHealthy()) {
    return fallback;
  }
  try {
    return await operation();
  } catch (error) {
    console.error("Redis operation failed:", error.message);
    return fallback;
  }
}

// Wait for connection
async function waitForRedis(timeoutMs = 30000) {
  if (!redis) throw new Error("Redis not initialized");
  
  // If already healthy, return immediately
  if (isRedisHealthy()) return redis;
  
  // With lazyConnect, we need to explicitly connect
  if (redis.status === "wait") {
    try {
      await redis.connect();
    } catch (err) {
      console.error("❌ Redis connect() failed:", err.message);
    }
  }
  
  // Wait for ready state
  const start = Date.now();
  while (!isRedisHealthy()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Redis connection timeout");
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return redis;
}

module.exports = {
  redis,
  redisConfig,
  isRedisHealthy,
  pingRedis,
  safeRedisOperation,
  waitForRedis,
  REDIS_URL,
};
