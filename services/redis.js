require("../config/loadEnv");

const Redis = require("ioredis");
const { redactUrl, validateRedisUri } = require("../config/validateEnv");

const REDIS_URL = String(process.env.REDIS_URL || "").trim();
const MAX_RETRY_DELAY_MS = 5_000;

let redis = null;
let isConnected = false;
let isReady = false;

console.log("Using Redis URL:", process.env.REDIS_URL);

function parseRedisUrl(url) {
  const parsed = new URL(url);
  const isTLS = parsed.protocol === "rediss:";

  return {
    host: parsed.hostname,
    port: parsed.port || (isTLS ? "6379" : "6379"),
    protocol: parsed.protocol,
    hasPassword: parsed.password.length > 0,
    isTLS,
    sanitizedUrl: redactUrl(url),
  };
}

function buildRedisConfig(url) {
  const parsedUrl = parseRedisUrl(url);

  // Use TLS automatically when the connection string is rediss:// so the same
  // code works for both local Redis and hosted providers like Render.
  return {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    tls: parsedUrl.isTLS ? {} : undefined,
    retryStrategy(times) {
      const retryDelay = Math.min(times * 1_000, MAX_RETRY_DELAY_MS);
      console.warn(`Redis reconnecting in ${retryDelay}ms`);
      return retryDelay;
    },
  };
}

function logEvictionPolicyWarning() {
  console.warn(
    "Skipping eviction policy check (not allowed on managed Redis like Render)"
  );
}

function createRedisClient() {
  if (!REDIS_URL) {
    console.error("REDIS_URL not set. Redis is disabled.");
    return null;
  }

  const validation = validateRedisUri(REDIS_URL);
  if (validation.errors.length > 0) {
    throw new Error(`Invalid REDIS_URL: ${validation.errors.join("; ")}`);
  }

  const parsedUrl = parseRedisUrl(REDIS_URL);
  const redisConfig = buildRedisConfig(REDIS_URL);

  console.log(`Redis configured: ${parsedUrl.sanitizedUrl}`);
  console.log(`Redis TLS: ${parsedUrl.isTLS ? "enabled" : "disabled"}`);

  for (const warning of validation.warnings) {
    console.warn(`REDIS_URL warning: ${warning}`);
  }

  const client = new Redis(REDIS_URL, redisConfig);

  client.on("connect", () => {
    isConnected = true;
    console.log("Redis connected");
  });

  client.on("ready", () => {
    isReady = true;
    console.log("Redis ready");
    logEvictionPolicyWarning();
  });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  client.on("close", () => {
    isConnected = false;
    isReady = false;
    console.warn("Redis connection closed");
  });

  client.on("end", () => {
    isConnected = false;
    isReady = false;
    console.warn("Redis connection ended");
  });

  client.on("reconnecting", (delay) => {
    console.warn(`Redis reconnecting in ${delay}ms`);
  });

  return client;
}

redis = createRedisClient();

function isRedisHealthy() {
  if (!redis) {
    return false;
  }

  return redis.status === "ready" && isConnected && isReady;
}

async function pingRedis() {
  if (!redis) {
    return false;
  }

  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
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
    console.error(`Redis operation failed: ${String(error?.message || error)}`);
    return fallback;
  }
}

async function waitForRedis(timeoutMs = 30_000) {
  if (!redis) {
    throw new Error("Redis not initialized");
  }

  if (isRedisHealthy()) {
    return redis;
  }

  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
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
  REDIS_URL,
  isRedisHealthy,
  pingRedis,
  safeRedisOperation,
  waitForRedis,
};
