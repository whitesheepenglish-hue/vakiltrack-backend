const IORedis = require("ioredis");

const redisConfig = {
  connection: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
};

const redis = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

module.exports = {
  redis,
  redisConfig,
};
