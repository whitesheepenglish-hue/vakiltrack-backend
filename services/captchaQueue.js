const { Queue, QueueEvents } = require("bullmq");
const { redisConfig } = require("./redis");

const captchaQueue = new Queue("captcha", {
  connection: redisConfig,
});
const captchaQueueEvents = new QueueEvents("captcha", {
  connection: redisConfig,
});

module.exports = {
  captchaQueue,
  captchaQueueEvents,
  redisConfig,
};
