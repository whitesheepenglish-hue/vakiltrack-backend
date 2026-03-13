const puppeteer = require("puppeteer");

async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      "/opt/render/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  return browser;
}

module.exports = { launchBrowser };
