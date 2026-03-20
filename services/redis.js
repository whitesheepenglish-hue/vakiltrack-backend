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
  // Render internal names look like "red-xxxxx" without domain
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
    console.warn("   Or use internal URL with full domain if connecting from same private network.");
  }
}

// Create Redis client with robust retry configuration
// NOTE: maxRetriesPerRequest is set to null for BullMQ compatibility
const redisConfig = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  enableOfflineQueue: false, // Prevent offline queue buildup
  lazyConnect: true, // Don't connect immediately, let us handle it
  keepAlive: 30000, // Send keepalive every 30 seconds to prevent idle timeout
  connectTimeout: 10000, // 10 seconds connection timeout
  commandTimeout: 5000, // 5 seconds command timeout
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    console.log(`🔄 Redis retry attempt ${times}, retrying in ${delay}ms...`);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EPIPE", "ECONNABORTED"];
    const errMsg = err.message || err.code || "";
    if (targetErrors.some(e => errMsg.includes(e))) {
      console.log(`🔄 Redis reconnecting due to error: ${errMsg}`);
      return true;
    }
    return false;
  },
  tls: REDIS_URL.startsWith("rediss://") ? {
    rejectUnauthorized: false // Allow self-signed certs if needed
  } : undefined,
};

const redis = new IORedis(REDIS_URL, redisConfig);

// Connection state tracking
let isConnected = false;
let isReady = false;
let connectionErrors = 0;

redis.on("connect", () => {
  isConnected = true;
  connectionErrors = 0;
  console.log("✅ Redis client connected");
});

redis.on("ready", () => {
  isReady = true;
  console.log("✅ Redis connection ready");
});

redis.on("error", (err) => {
  connectionErrors++;
  isConnected = false;
  isReady = false;

  // Log detailed error info
  console.error("❌ Redis Error:", err.message);
  console.error("   Error Code:", err.code || err.errno || "N/A");
  console.error("   Error Count:", connectionErrors);

  // Specific handling for common errors
  if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
    console.error("   💡 Hostname not found. Check your REDIS_URL environment variable.");
    console.error(`   Current URL: ${REDIS_URL.replace(/:[^:@]+@/, ":****@")}`);
  } else if (err.code === "ECONNREFUSED") {
    console.error("   💡 Connection refused. Is Redis running and accessible?");
  } else if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "EPIPE") {
    console.error("   💡 Connection interrupted. Redis server may have closed the connection due to idle timeout.");
    console.error("   Keepalive is configured to prevent this.");
  } else if (err.code === "ECONNABORTED") {
    console.error("   💡 Connection aborted. Network issue or server-side timeout.");
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

// Utility to check Redis health
function isRedisHealthy() {
  return isConnected && isReady;
}

// Safe Redis operations with fallback
async function safeRedisOperation(operation, fallback = null) {
  if (!isRedisHealthy()) {
    console.warn("⚠️  Redis not healthy, using fallback value");
    return fallback;
  }

  try {
    return await operation();
  } catch (error) {
    console.error("❌ Redis operation failed:", error.message);
    return fallback;
  }
}

module.exports = {
  redis,
  isRedisHealthy,
  safeRedisOperation,
  REDIS_URL,
};
