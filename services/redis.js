require("../config/loadEnv");

const IORedis = require("ioredis");

const REDIS_URL = String(process.env.REDIS_URL || "").trim();

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
    console.error("Invalid REDIS_URL format:", error.message);
    return null;
  }
}

function isLikelyIncompleteHostname(hostname) {
  return hostname && hostname.match(/^red-[a-z0-9]+$/) !== null;
}

const parsedUrl = REDIS_URL ? parseRedisUrl(REDIS_URL) : null;

if (parsedUrl) {
  console.log("Redis Configuration:");
  console.log(`   Host: ${parsedUrl.host}`);
  console.log(`   Port: ${parsedUrl.port}`);
  console.log(`   TLS: ${parsedUrl.isTLS ? "Yes" : "No"}`);
  console.log(`   Auth: ${parsedUrl.hasPassword ? "Yes" : "No"}`);

  if (isLikelyIncompleteHostname(parsedUrl.host)) {
    console.warn("Warning: Redis hostname looks like an internal service name.");
    console.warn("   On Render, use the external URL format: redis://red-xxxx:password@host.render.com:6379");
  }
}

const redisConfig = {
  maxRetriesPerRequest: null,
};

const redis = REDIS_URL ? new IORedis(REDIS_URL, redisConfig) : null;
let isConnected = false;
let isReady = false;

if (redis) {
  redis.on("connect", () => {
    isConnected = true;
    console.log("Redis connected");
  });

  redis.on("ready", () => {
    isReady = true;
    console.log("Redis ready");
  });

  redis.on("error", (err) => {
    if (err.code !== "ECONNRESET" && err.code !== "ETIMEDOUT") {
      console.error("Redis error:", err.message);
      if (err.code === "ENOTFOUND") {
        console.error("Check REDIS_URL environment variable");
      }
    }
  });

  redis.on("close", () => {
    isConnected = false;
    isReady = false;
    console.log("Redis connection closed");
  });

  redis.on("reconnecting", () => {
    console.log("Redis reconnecting...");
  });
} else {
  console.error("REDIS_URL not set. Redis is disabled.");
}

function isRedisHealthy() {
  if (!redis) return false;
  return redis.status === "ready" || (isConnected && isReady);
}

async function pingRedis() {
  if (!redis) return false;
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    return false;
  }
}

async function safeRedisOperation(operation, fallback = null) {
  if (!redis) {
    return fallback;
  }

  try {
    await waitForRedis();
    return await operation();
  } catch (error) {
    console.error("Redis operation failed:", error.message);
    return fallback;
  }
}

async function waitForRedis(timeoutMs = 30000) {
  if (!redis) throw new Error("Redis not initialized");

  if (isRedisHealthy()) return redis;

  if (redis.status === "wait" || redis.status === "end") {
    try {
      await redis.connect();
    } catch (err) {
      const message = String(err?.message || "");
      if (!message.includes("already connecting") && !message.includes("already connected")) {
        console.error("Redis connect() failed:", message);
      }
    }
  }

  const start = Date.now();
  while (!isRedisHealthy()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Redis connection timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
