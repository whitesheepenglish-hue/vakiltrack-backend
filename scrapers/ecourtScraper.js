const puppeteer = require("puppeteer");

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
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

const getLaunchOptions = () => {
  const executablePath = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  const options = {
    headless: true,
    args: PUPPETEER_ARGS,
  };

  if (executablePath) {
    options.executablePath = executablePath;
  }

  return options;
};

async function startScraper() {
  let browser;

  try {
    browser = await puppeteer.launch(getLaunchOptions());

    const page = await browser.newPage();
    await page.goto(ECOURTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page.waitForSelector("#captcha_image", { timeout: 15_000 });

    const captchaElement = await page.$("#captcha_image");
    if (!captchaElement) {
      throw new Error("Captcha image not found");
    }

    const imageBuffer = await captchaElement.screenshot({ type: "png" });
    return imageBuffer;
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
    browser = await puppeteer.launch(getLaunchOptions());

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
