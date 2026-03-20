require("../config/loadEnv");

const IORedis = require("ioredis");

const redis = new IORedis(process.env.REDIS_URL);

redis.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

module.exports = {
  redis,
};
