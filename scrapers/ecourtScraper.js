const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const NodeCache = require("node-cache");
const puppeteer = require("puppeteer");
const { redis } = require("../services/redis");

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const CAPTCHA_SELECTOR = "#captcha_image";
const CNR_INPUT_SELECTOR = "#cino";
const CAPTCHA_INPUT_SELECTOR = "#fcaptcha_code";
const SEARCH_BUTTON_SELECTOR = "#searchbtn";
const CAPTCHA_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = Number(process.env.MAX_PAGES || 10);
const PAGE_WAIT_MS = 100;
const BROWSER_RESTART_INTERVAL_MS = 1000 * 60 * 10;
const captchaPages = new Map();
const captchaCache = new NodeCache({ stdTTL: 60 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_RETRY_COUNT = 3;
let sharedBrowser = null;
let sharedBrowserPromise = null;
let activePages = 0;

const normalizeCaseNumber = (caseNumber) => String(caseNumber || "").trim().toUpperCase();
const normalizeCaptcha = (captcha) => String(captcha || "").trim();
const getCaptchaCacheKey = (caseNumber) => `captcha:${normalizeCaseNumber(caseNumber) || "global"}`;
const getCaptchaSessionKey = (sessionId) => `captcha:${sessionId}`;

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

async function retry(fn, retries = DEFAULT_RETRY_COUNT) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Retry ${attempt + 1} failed`, error?.message || error);
      if (attempt === retries - 1) {
        throw error;
      }
    }
  }
}

async function safePage() {
  while (activePages >= MAX_PAGES) {
    await sleep(PAGE_WAIT_MS);
  }

  activePages += 1;
}

function releasePage() {
  activePages = Math.max(0, activePages - 1);
}

function logScraperStats() {
  console.log({
    activePages,
    memory: process.memoryUsage().heapUsed,
  });
}

async function closePage(page) {
  if (!page || page.__vakiltrackReleased) {
    return;
  }

  page.__vakiltrackReleased = true;
  releasePage();
  logScraperStats();
  await page.close().catch(() => {});
  page = null;
}

async function getSessionMetadata(id) {
  if (!id) {
    return null;
  }

  const rawSession = await redis.get(getCaptchaSessionKey(id));
  return rawSession ? JSON.parse(rawSession) : null;
}

async function getSession(id) {
  if (!id) {
    return null;
  }

  const session = await getSessionMetadata(id);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    await closeCaptchaSession(id, session).catch(() => {});
    return null;
  }

  const localSession = captchaPages.get(id);
  if (!localSession?.page) {
    return {
      ...session,
      page: null,
      timeoutHandle: null,
    };
  }

  return {
    ...session,
    ...localSession,
  };
}

async function closeCaptchaSession(sessionId, session = null) {
  const resolvedSession = session || await getSessionMetadata(sessionId).catch(() => null);
  captchaPages.delete(sessionId);
  await redis.del(getCaptchaSessionKey(sessionId));

  if (!resolvedSession) {
    return;
  }

  clearTimeout(resolvedSession.timeoutHandle);
  captchaCache.del(getCaptchaCacheKey(resolvedSession.caseNumber));

  await closePage(resolvedSession.page);
}

function scheduleSessionCleanup(sessionId) {
  return setTimeout(() => {
    closeCaptchaSession(sessionId).catch(() => {});
  }, CAPTCHA_SESSION_TTL_MS);
}

async function captureCaptchaImage(page) {
  await page.waitForSelector(CAPTCHA_SELECTOR, { timeout: 30_000 });
  await sleep(1_000);

  const captchaElement = await page.$(CAPTCHA_SELECTOR);
  if (!captchaElement) {
    throw new Error("Captcha image element not found on eCourts page.");
  }

  return captchaElement.screenshot({ type: "png" });
}

function findChromeInDir(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) {
    return null;
  }

  const versionDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const versionDir of versionDirs) {
    const candidate = path.join(baseDir, versionDir, "chrome-linux64", "chrome");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveChromeExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }

  if (process.platform !== "linux") {
    return null;
  }

  const candidateRoots = [
    "/opt/render/.cache/puppeteer/chrome",
    "/opt/render/project/.cache/puppeteer/chrome",
  ];

  for (const root of candidateRoots) {
    const executablePath = findChromeInDir(root);
    if (executablePath) {
      return executablePath;
    }
  }

  return null;
}

async function launchBrowser() {
  const executablePath = resolveChromeExecutablePath();
  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return puppeteer.launch(launchOptions);
}

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }

  if (!sharedBrowserPromise) {
    // Reuse one Puppeteer browser across jobs; each request gets its own page.
    sharedBrowserPromise = launchBrowser()
      .then((browser) => {
        sharedBrowser = browser;
        browser.once("disconnected", () => {
          sharedBrowser = null;
          sharedBrowserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        sharedBrowser = null;
        sharedBrowserPromise = null;
        throw error;
      });
  }

  return sharedBrowserPromise;
}

setInterval(async () => {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
    sharedBrowserPromise = null;
  }
}, BROWSER_RESTART_INTERVAL_MS);

async function openEcourtsPage() {
  const browser = await getBrowser();
  await safePage();
  logScraperStats();

  let page;

  try {
    page = await browser.newPage();
    await page.setCacheEnabled(false);

    await Promise.all([
      page.goto(ECOURTS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      }),
      page.waitForSelector(CAPTCHA_SELECTOR, { timeout: 30_000 }),
    ]);

    await page.waitForSelector(CNR_INPUT_SELECTOR, { timeout: 15_000 });
    await page.waitForSelector(CAPTCHA_INPUT_SELECTOR, { timeout: 15_000 });
    await page.waitForSelector(SEARCH_BUTTON_SELECTOR, { timeout: 15_000 });

    return { browser, page };
  } catch (error) {
    await closePage(page);
    throw error;
  }
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");

  if (value) {
    await page.type(selector, value);
  }
}

function extractValue(recordMap, labels) {
  for (const label of labels) {
    if (recordMap[label]) {
      return recordMap[label];
    }
  }

  return "";
}

async function extractPageState(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visibleText = clean(document.body?.innerText || "");

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal, .swal2-popup'))
      .map((node) => clean(node.innerText))
      .filter(Boolean);

    const tables = Array.from(document.querySelectorAll("table")).map((table) =>
      Array.from(table.querySelectorAll("tr")).map((row) =>
        Array.from(row.querySelectorAll("th,td"))
          .map((cell) => clean(cell.innerText))
          .filter(Boolean),
      ).filter((row) => row.length > 0),
    ).filter((table) => table.length > 0);

    const pairs = {};
    for (const table of tables) {
      for (const row of table) {
        if (row.length === 2) {
          pairs[row[0].toLowerCase()] = row[1];
          continue;
        }

        if (row.length > 2 && row.length % 2 === 0) {
          for (let index = 0; index < row.length; index += 2) {
            pairs[row[index].toLowerCase()] = row[index + 1];
          }
        }
      }
    }

    return {
      visibleText,
      dialogs,
      tables,
      pairs,
      title: document.title,
    };
  });
}

function buildCaseFromState(caseNumber, state) {
  const petitioner = extractValue(state.pairs, [
    "petitioner and advocate",
    "petitioner",
    "petitioner/plaintiff",
  ]);
  const respondent = extractValue(state.pairs, [
    "respondent and advocate",
    "respondent",
    "respondent/defendant",
  ]);
  const nextHearing = extractValue(state.pairs, [
    "next hearing date",
    "next date",
    "hearing date",
  ]);
  const court = extractValue(state.pairs, [
    "court establishment",
    "court no and judge",
    "court number and judge",
    "judge",
    "court",
  ]);

  return buildResult(caseNumber, {
    petitioner,
    respondent,
    nextHearing,
    court,
    pageTitle: state.title,
    rawText: state.visibleText,
    tables: state.tables,
  });
}

async function createCaptchaSession(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);
  const { page } = await openEcourtsPage();

  try {
    if (normalizedCaseNumber) {
      await clearAndType(page, CNR_INPUT_SELECTOR, normalizedCaseNumber);
    }

    const captchaImage = await captureCaptchaImage(page);
    const sessionId = randomUUID();
    const expiresAt = Date.now() + CAPTCHA_SESSION_TTL_MS;
    const timeoutHandle = scheduleSessionCleanup(sessionId);

    captchaPages.set(sessionId, {
      page,
      timeoutHandle,
    });
    await redis.set(
      getCaptchaSessionKey(sessionId),
      JSON.stringify({
        caseNumber: normalizedCaseNumber,
        expiresAt,
      }),
      "EX",
      Math.floor(CAPTCHA_SESSION_TTL_MS / 1000),
    );

    return {
      sessionId,
      caseNumber: normalizedCaseNumber,
      expiresAt,
      imageBuffer: captchaImage,
      imageBase64: captchaImage.toString("base64"),
    };
  } catch (error) {
    await closePage(page);
    throw error;
  }
}

async function getCachedCaptchaSession(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);
  const cacheKey = getCaptchaCacheKey(normalizedCaseNumber);

  if (captchaCache.has(cacheKey)) {
    const cachedSession = captchaCache.get(cacheKey);
    if (cachedSession?.sessionId && await getSession(cachedSession.sessionId)) {
      return cachedSession;
    }

    captchaCache.del(cacheKey);
  }

  const data = await createCaptchaSession(normalizedCaseNumber);
  captchaCache.set(cacheKey, data);

  return data;
}

async function refreshCaptcha(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Captcha session expired or was not found.");
  }

  // Start over with a brand new eCourts page instead of trusting the current
  // browser state after a failed captcha attempt.
  await closeCaptchaSession(sessionId, session);
  return createCaptchaSession(session.caseNumber);
}

async function startScraper(caseNumber) {
  const session = await retry(() => getCachedCaptchaSession(caseNumber));
  return session.imageBuffer;
}

async function submitCaptchaSolution({ sessionId, caseNumber, captcha }) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Captcha session expired or was not found. Request a new captcha and try again.");
  }

  if (!session.page) {
    throw new Error("Captcha session is not available on this server. Request a new captcha and submit it to the same worker instance.");
  }

  const normalizedCaseNumber = normalizeCaseNumber(caseNumber || session.caseNumber);
  const normalizedCaptcha = normalizeCaptcha(captcha);

  if (!normalizedCaseNumber) {
    throw new Error("caseNumber is required");
  }

  if (!normalizedCaptcha) {
    throw new Error("captcha is required");
  }

  session.caseNumber = normalizedCaseNumber;
  await redis.set(
    getCaptchaSessionKey(sessionId),
    JSON.stringify({
      caseNumber: normalizedCaseNumber,
      expiresAt: session.expiresAt,
    }),
    "EX",
    Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000)),
  );

  const { page } = session;

  await clearAndType(page, CNR_INPUT_SELECTOR, normalizedCaseNumber);
  await clearAndType(page, CAPTCHA_INPUT_SELECTOR, normalizedCaptcha);
  try {
    await page.click(SEARCH_BUTTON_SELECTOR);
    await sleep(2_000);

    const state = await extractPageState(page);
    const dialogText = state.dialogs.join(" ").toLowerCase();

    if (dialogText.includes("invalid captcha")) {
      const refreshed = await refreshCaptcha(sessionId);

      return {
        ok: false,
        code: "INVALID_CAPTCHA",
        message: "Invalid captcha. Please solve the refreshed captcha and try again.",
        sessionId: refreshed.sessionId,
        caseNumber: normalizedCaseNumber,
        expiresAt: refreshed.expiresAt,
        captchaImageBase64: refreshed.imageBase64,
      };
    }

    if (dialogText.includes("record not found") || state.visibleText.toLowerCase().includes("record not found")) {
      await closeCaptchaSession(sessionId);

      return {
        ok: true,
        code: "NOT_FOUND",
        message: "No case record was found for that CNR number.",
        case: buildResult(normalizedCaseNumber, {
          court: "eCourts",
          note: "No case record was found for that CNR number.",
          rawText: state.visibleText,
          tables: state.tables,
        }),
      };
    }

    const result = buildCaseFromState(normalizedCaseNumber, state);
    await closeCaptchaSession(sessionId);

    return {
      ok: true,
      code: "SUCCESS",
      message: "Case data fetched from eCourts.",
      case: result,
    };
  } catch (error) {
    await closeCaptchaSession(sessionId).catch(() => {});
    throw error;
  }
}

async function scrapeCase(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);

  if (!normalizedCaseNumber) {
    throw new Error("caseNumber is required");
  }

  try {
    const challenge = await retry(() => getCachedCaptchaSession(normalizedCaseNumber));

    return buildResult(normalizedCaseNumber, {
      court: "eCourts",
      note: "Manual CAPTCHA solving is required. Use the returned sessionId and captcha image to complete the search.",
      captchaRequired: true,
      sessionId: challenge.sessionId,
      expiresAt: challenge.expiresAt,
      captchaImageBase64: challenge.imageBase64,
    });
  } catch (error) {
    console.warn("Puppeteer unavailable; returning fallback data.", error?.message || error);
    return buildFallbackCase(normalizedCaseNumber, error?.message || "unknown error");
  }
}

scrapeCase.startScraper = startScraper;
scrapeCase.createCaptchaSession = createCaptchaSession;
scrapeCase.getCachedCaptchaSession = getCachedCaptchaSession;
scrapeCase.refreshCaptcha = refreshCaptcha;
scrapeCase.submitCaptchaSolution = submitCaptchaSolution;
scrapeCase.closeCaptchaSession = closeCaptchaSession;
scrapeCase.retry = retry;
scrapeCase.withRetry = retry;
scrapeCase.getBrowser = getBrowser;

module.exports = scrapeCase;
