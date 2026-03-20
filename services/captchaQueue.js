require("../config/loadEnv");

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

const captchaQueue = new Queue("captcha", {
  connection,
});

module.exports = {
  captchaQueue,
  connection,
};
