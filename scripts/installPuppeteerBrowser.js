const { spawnSync } = require("node:child_process");

const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const defaultCacheDir = "/opt/render/project/.cache/puppeteer";

if (isRender && !process.env.PUPPETEER_CACHE_DIR) {
  process.env.PUPPETEER_CACHE_DIR = defaultCacheDir;
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["puppeteer", "browsers", "install", "chrome"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}
