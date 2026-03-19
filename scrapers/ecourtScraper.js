const fs = require("node:fs");
const puppeteer = require("puppeteer");

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const CAPTCHA_SELECTOR = "#captcha_image";
const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
];
const KNOWN_BROWSER_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const normalizeCaseNumber = (caseNumber) => String(caseNumber || "").trim();

const emptyCase = (caseNumber) => ({
  caseNumber,
  petitioner: "",
  respondent: "",
  nextHearing: "",
  court: "",
});

const buildResult = (caseNumber, overrides = {}) => ({
  ...emptyCase(caseNumber),
  source: "ecourts",
  ...overrides,
});

const buildFallbackCase = (caseNumber, reason) =>
  buildResult(caseNumber, {
    source: "fallback",
    note: `Live scraping unavailable: ${reason}`,
  });

function getConfiguredBrowserPath() {
  const configuredPath = String(process.env.CHROME_EXECUTABLE_PATH || "").trim();

  if (!configuredPath) {
    return undefined;
  }

  if (fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  console.warn(
    `Ignoring CHROME_EXECUTABLE_PATH because it does not exist: ${configuredPath}`,
  );
  return undefined;
}

function getManagedBrowserPath() {
  try {
    const managedPath = puppeteer.executablePath();
    if (managedPath && fs.existsSync(managedPath)) {
      return managedPath;
    }
  } catch {
    // Ignore resolution errors and keep trying other candidates.
  }

  return undefined;
}

function resolveBrowserPath() {
  const configuredPath = getConfiguredBrowserPath();
  if (configuredPath) {
    return configuredPath;
  }

  const managedPath = getManagedBrowserPath();
  if (managedPath) {
    return managedPath;
  }

  return KNOWN_BROWSER_PATHS.find((candidatePath) => fs.existsSync(candidatePath));
}

async function launchBrowser() {
  const executablePath = resolveBrowserPath();

  return puppeteer.launch({
    headless: "new",
    args: BROWSER_ARGS,
    ...(executablePath ? { executablePath } : {}),
  });
}

async function startScraper() {
  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.goto(ECOURTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page.waitForSelector(CAPTCHA_SELECTOR, { timeout: 15_000 });

    const captchaElement = await page.$(CAPTCHA_SELECTOR);
    if (!captchaElement) {
      throw new Error("Captcha image element not found on eCourts page.");
    }

    const captchaImage = await captchaElement.screenshot({ type: "png" });
    return captchaImage;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function scrapeCase(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);

  if (!normalizedCaseNumber) {
    throw new Error("caseNumber is required");
  }

  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.goto(ECOURTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const pageTitle = await page.title();

    // eCourts keeps the actual case search behind CAPTCHA, so we treat
    // "portal is reachable and browser launched" as the live scraper check.
    return buildResult(normalizedCaseNumber, {
      court: "eCourts",
      note: `Portal loaded successfully (${pageTitle}), but the search flow still requires CAPTCHA solving.`,
    });
  } catch (error) {
    console.warn("Puppeteer unavailable; returning fallback data.", error?.message || error);
    return buildFallbackCase(normalizedCaseNumber, error?.message || "unknown error");
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

scrapeCase.startScraper = startScraper;
module.exports = scrapeCase;
