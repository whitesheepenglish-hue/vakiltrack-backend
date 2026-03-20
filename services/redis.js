const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

const redisConfig = redisUrl
  ? redisUrl
  : {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
    };

const redis = new Redis(redisConfig);

module.exports = {
  redis,
  redisConfig,
};
