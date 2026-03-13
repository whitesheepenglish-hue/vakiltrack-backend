const { chromium } = require("playwright");

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();

  await page.goto("https://services.ecourts.gov.in/");

  console.log("eCourts page opened");

  return browser;
}

module.exports = { launchBrowser };
