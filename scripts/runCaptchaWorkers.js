const path = require("node:path");
const { fork } = require("node:child_process");

const workerCount = Math.max(1, Number(process.env.CAPTCHA_WORKERS || 3));
const workerPath = path.join(__dirname, "..", "jobs", "captchaWorker.js");
const workers = new Map();

function startWorker(index) {
  const child = fork(workerPath, [], {
    env: {
      ...process.env,
      CAPTCHA_WORKER_INDEX: String(index),
    },
  });

  workers.set(index, child);
  console.log(`Started captcha worker ${index} with pid ${child.pid}`);

  child.on("exit", (code, signal) => {
    workers.delete(index);
    console.error(
      `Captcha worker ${index} exited (pid ${child.pid}, code=${code ?? "null"}, signal=${signal ?? "null"})`,
    );
  });

  return child;
}

for (let index = 1; index <= workerCount; index += 1) {
  startWorker(index);
}

function shutdown(signal) {
  console.log(`Stopping captcha worker pool on ${signal}`);
  for (const child of workers.values()) {
    child.kill(signal);
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
