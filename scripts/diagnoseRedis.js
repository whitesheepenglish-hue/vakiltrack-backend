#!/usr/bin/env node
/**
 * Redis Connection Diagnostic Script
 * Run this to diagnose Redis connection issues
 */

require("../config/loadEnv");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;

console.log("🔍 Redis Connection Diagnostics");
console.log("================================\n");

if (!REDIS_URL) {
  console.error("❌ REDIS_URL is not set!");
  console.log("   Please set REDIS_URL environment variable.\n");
  process.exit(1);
}

// Parse and analyze the URL
let parsedUrl;
try {
  parsedUrl = new URL(REDIS_URL);
} catch (error) {
  console.error("❌ Invalid REDIS_URL format:", error.message);
  process.exit(1);
}

console.log("📋 Configuration Analysis:");
console.log(`   Full URL: ${REDIS_URL.replace(/:[^:@]+@/, ":****@")}`);
console.log(`   Protocol: ${parsedUrl.protocol}`);
console.log(`   Hostname: ${parsedUrl.hostname}`);
console.log(`   Port: ${parsedUrl.port || 6379}`);
console.log(`   Username: ${parsedUrl.username || "none"}`);
console.log(`   Password: ${parsedUrl.password ? "*****" : "none"}`);
console.log(`   Path: ${parsedUrl.pathname || "/"}`);
console.log("");

// Check if hostname looks like internal Render name
if (/^red-[a-z0-9]+$/.test(parsedUrl.hostname)) {
  console.warn("⚠️  WARNING: Hostname looks like an internal Render service name!");
  console.warn("   The hostname appears to be incomplete and won't resolve externally.\n");
  console.log("🔧 Suggested fixes:");
  console.log("   1. Use the EXTERNAL Redis URL from your Render dashboard:");
  console.log("      Format: redis://red-xxx:password@redis-xxx.xxx.cloud.redislabs.com:6379");
  console.log("   2. If connecting from same Render private network, use internal URL with domain:");
  console.log("      Format: redis://red-xxx:password@red-xxx.internal:6379");
  console.log("   3. Check your Redis service settings in Render dashboard\n");
}

// DNS lookup test (Node.js built-in)
const dns = require("dns");
console.log("🔍 Testing DNS resolution...");
dns.lookup(parsedUrl.hostname, (err, address) => {
  if (err) {
    console.error(`❌ DNS Lookup failed for ${parsedUrl.hostname}`);
    console.error(`   Error: ${err.code} - ${err.message}`);
    console.log("");
    console.log("🔧 Possible causes:");
    console.log("   - Hostname is incorrect or doesn't exist");
    console.log("   - DNS is not propagated yet");
    console.log("   - Network connectivity issues");
    console.log("   - Firewall blocking DNS requests\n");
    return;
  }
  console.log(`✅ DNS resolved: ${parsedUrl.hostname} -> ${address}\n`);
});

// Attempt Redis connection with timeout
console.log("🔍 Testing Redis connection...");
const redis = new IORedis(REDIS_URL, {
  connectTimeout: 5000,
  lazyConnect: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null, // Disable retries for diagnosis
  tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
});

const startTime = Date.now();

redis.on("connect", () => {
  console.log(`✅ Connected to Redis in ${Date.now() - startTime}ms\n`);
});

redis.on("ready", async () => {
  console.log("✅ Redis connection is ready");

  // Test basic operations
  try {
    await redis.set("__diagnostic_test__", "ping");
    const pong = await redis.get("__diagnostic_test__");
    await redis.del("__diagnostic_test__");

    if (pong === "ping") {
      console.log("✅ Redis PING/PONG test passed\n");
    } else {
      console.warn("⚠️  Unexpected response from Redis\n");
    }
  } catch (error) {
    console.error("❌ Redis operation test failed:", error.message);
  }

  console.log("✅ All diagnostics passed! Redis is working correctly.\n");
  await redis.quit();
  process.exit(0);
});

redis.on("error", async (err) => {
  console.error(`❌ Redis Error (${Date.now() - startTime}ms):`);
  console.error(`   Code: ${err.code || "N/A"}`);
  console.error(`   Message: ${err.message}`);

  if (err.code === "ENOTFOUND") {
    console.error("\n🔧 This is a DNS resolution error.");
    console.error("   The hostname cannot be found. Check if:");
    console.error("   - The hostname is spelled correctly");
    console.error("   - You're using the correct URL (internal vs external)");
    console.error("   - The Redis service is running\n");
  } else if (err.code === "ECONNREFUSED") {
    console.error("\n🔧 Connection refused. Check if:");
    console.error("   - Redis service is running");
    console.error("   - Port is correct");
    console.error("   - Firewall allows the connection\n");
  } else if (err.code === "ETIMEDOUT") {
    console.error("\n🔧 Connection timed out. Check if:");
    console.error("   - Network connectivity to the Redis host");
    console.error("   - Firewall/security group rules");
    console.error("   - VPN or proxy settings\n");
  } else if (err.code === "ECONNRESET") {
    console.error("\n🔧 Connection reset. Check if:");
    console.error("   - TLS/SSL settings match the server");
    console.error("   - Authentication credentials are correct\n");
  }

  await redis.quit();
  process.exit(1);
});
