const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

function resolveChromeExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const chromeCacheRoot = "/opt/render/.cache/puppeteer/chrome";
  if (!fs.existsSync(chromeCacheRoot)) return undefined;

  try {
    const candidates = fs
      .readdirSync(chromeCacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("linux-"))
      .map((entry) =>
        path.posix.join(chromeCacheRoot, entry.name, "chrome-linux64", "chrome")
      );

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: resolveChromeExecutablePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  return browser;
}

module.exports = { launchBrowser };
