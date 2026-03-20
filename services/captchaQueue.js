require("../config/loadEnv");

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl = String(process.env.REDIS_URL || "").trim();

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
});

connection.on("connect", () => {
  console.log("✅ Redis Connected");
});

connection.on("error", (err) => {
  console.error("❌ Redis Error:", err.message);
});

const captchaQueue = new Queue("captcha", {
  connection,
});

module.exports = {
  captchaQueue,
  connection,
};
