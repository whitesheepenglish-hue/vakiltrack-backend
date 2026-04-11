const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");
const puppeteer = require("puppeteer");
const { CookieJar } = require("tough-cookie");
const { redis, waitForRedis } = require("../services/redis");

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const SEARCH_ENDPOINT = "?p=cnr_status/searchByCNR/";
const CAPTCHA_SELECTOR = "#captcha_image";
const CNR_INPUT_SELECTOR = "#cino";
const CAPTCHA_INPUT_SELECTOR = "#fcaptcha_code";
const CAPTCHA_SESSION_TTL_MS = 120 * 1000;
const CAPTCHA_MAX_AGE_MS = 60 * 1000;
const SCRAPE_TIMEOUT_MS = 12_000;
const MAX_PAGES = Number(process.env.MAX_PAGES || 10);
const PAGE_WAIT_MS = 100;
const BROWSER_RESTART_INTERVAL_MS = 1000 * 60 * 10;
const PAGE_LOAD_TIMEOUT = 60_000;
const CAPTCHA_LOAD_TIMEOUT = 30_000;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRYABLE_SUBMIT_ATTEMPTS = 2;
const captchaCache = new NodeCache({ stdTTL: 60 });
const localSessionCache = new NodeCache({ stdTTL: Math.ceil(CAPTCHA_SESSION_TTL_MS / 1000) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sharedBrowser = null;
let sharedBrowserPromise = null;
let activePages = 0;

const normalizeCaseNumber = (caseNumber) => String(caseNumber || "").trim().toUpperCase();
const normalizeCaptcha = (captcha) => String(captcha || "").trim().toUpperCase();
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

function createAppError(message, options = {}) {
  const error = new Error(message);
  error.statusCode = options.statusCode || 400;
  error.code = options.code || "REQUEST_FAILED";
  error.retryable = options.retryable === true;
  error.details = options.details || null;
  return error;
}

function logScraperEvent(event, payload = {}) {
  console.log(`[ecourts] ${event}`, payload);
}

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
}

async function getRedisClient() {
  if (!redis) {
    return null;
  }

  try {
    return await waitForRedis();
  } catch (error) {
    console.warn("Redis unavailable for captcha session:", error?.message || error);
    return null;
  }
}

function sanitizeCookies(cookies) {
  return Array.isArray(cookies)
    ? cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expires: cookie.expires,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite,
    }))
    : [];
}

async function storeSessionMetadata(sessionId, metadata) {
  const sessionKey = getCaptchaSessionKey(sessionId);
  const client = await getRedisClient();

  if (client) {
    await client.set(sessionKey, JSON.stringify(metadata), "EX", 120);
  }

  localSessionCache.set(sessionKey, metadata, Math.ceil(CAPTCHA_SESSION_TTL_MS / 1000));
}

async function getSessionMetadata(sessionId) {
  if (!sessionId) {
    return null;
  }

  const sessionKey = getCaptchaSessionKey(sessionId);
  const client = await getRedisClient();

  if (client) {
    try {
      const rawSession = await client.get(sessionKey);
      if (rawSession) {
        return JSON.parse(rawSession);
      }
    } catch (error) {
      console.warn("Redis get failed:", error?.message || error);
    }
  }

  return localSessionCache.get(sessionKey) || null;
}

async function deleteSessionMetadata(sessionId) {
  const sessionKey = getCaptchaSessionKey(sessionId);
  const client = await getRedisClient();

  if (client) {
    try {
      await client.del(sessionKey);
    } catch (error) {
      console.warn("Redis del failed:", error?.message || error);
    }
  }

  localSessionCache.del(sessionKey);
}

async function getSession(sessionId) {
  const session = await getSessionMetadata(sessionId);
  if (!session) {
    return null;
  }

  const ageMs = Date.now() - Number(session.createdAt || 0);
  if (
    !session.createdAt ||
    !session.expiresAt ||
    session.expiresAt <= Date.now() ||
    ageMs > CAPTCHA_MAX_AGE_MS
  ) {
    await closeCaptchaSession(sessionId, session).catch(() => {});
    return null;
  }

  return session;
}

async function closeCaptchaSession(sessionId, session = null) {
  const resolvedSession = session || await getSessionMetadata(sessionId).catch(() => null);
  await deleteSessionMetadata(sessionId);

  if (resolvedSession?.caseNumber) {
    captchaCache.del(getCaptchaCacheKey(resolvedSession.caseNumber));
  }
}

async function captureCaptchaImage(page) {
  await page.waitForSelector(CAPTCHA_SELECTOR, { timeout: CAPTCHA_LOAD_TIMEOUT });
  await sleep(1_000);

  const captchaElement = await page.$(CAPTCHA_SELECTOR);
  if (!captchaElement) {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
    });
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

  if (process.platform === "win32") {
    const windowsPaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    ].filter(Boolean);

    for (const winPath of windowsPaths) {
      if (fs.existsSync(winPath)) {
        console.log(`Found Chrome at: ${winPath}`);
        return winPath;
      }
    }

    return null;
  }

  if (process.platform !== "linux") {
    return null;
  }

  const candidateRoots = [
    "/opt/render/.cache/puppeteer/chrome",
    "/opt/render/project/.cache/puppeteer/chrome",
    "/home/render/.cache/puppeteer/chrome",
    "/root/.cache/puppeteer/chrome",
    "/.cache/puppeteer/chrome",
  ];

  for (const root of candidateRoots) {
    const executablePath = findChromeInDir(root);
    if (executablePath) {
      console.log(`Found Chrome at: ${executablePath}`);
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
    await page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT);
    await page.setDefaultTimeout(PAGE_LOAD_TIMEOUT);
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 1366, height: 768 });

    await page.goto(ECOURTS_URL, {
      waitUntil: "networkidle2",
      timeout: PAGE_LOAD_TIMEOUT,
    });

    await Promise.all([
      page.waitForSelector(CAPTCHA_SELECTOR, { timeout: CAPTCHA_LOAD_TIMEOUT }),
      page.waitForSelector(CNR_INPUT_SELECTOR, { timeout: 15_000 }),
      page.waitForSelector(CAPTCHA_INPUT_SELECTOR, { timeout: 15_000 }),
    ]);

    return { browser, page };
  } catch (error) {
    await closePage(page);
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
      details: { reason: error?.message || String(error) },
    });
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

function buildPairsAndTablesFromHtml(html) {
  const $ = cheerio.load(`<div id="vakiltrack-ecourts-root">${html || ""}</div>`);
  const tables = [];
  const pairs = {};

  $("#vakiltrack-ecourts-root table").each((_, table) => {
    const rows = [];

    $(table).find("tr").each((__, row) => {
      const cells = $(row).find("th, td").map((___, cell) => (
        $(cell).text().replace(/\s+/g, " ").trim()
      )).get().filter(Boolean);

      if (cells.length > 0) {
        rows.push(cells);
      }

      if (cells.length === 2) {
        pairs[cells[0].toLowerCase()] = cells[1];
      } else if (cells.length > 2 && cells.length % 2 === 0) {
        for (let index = 0; index < cells.length; index += 2) {
          pairs[String(cells[index] || "").toLowerCase()] = cells[index + 1];
        }
      }
    });

    if (rows.length > 0) {
      tables.push(rows);
    }
  });

  const visibleText = $("#vakiltrack-ecourts-root").text().replace(/\s+/g, " ").trim();

  return { pairs, tables, visibleText };
}

function buildCaseFromHtml(caseNumber, html) {
  const state = buildPairsAndTablesFromHtml(html);
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
    rawText: state.visibleText,
    tables: state.tables,
  });
}

function buildAxiosCookieJar(cookies) {
  const jar = new CookieJar();

  for (const cookie of cookies || []) {
    if (!cookie?.name || typeof cookie.value === "undefined") {
      continue;
    }

    const domain = String(cookie.domain || "services.ecourts.gov.in").replace(/^\./, "");
    const pathName = cookie.path || "/";
    const cookieUrl = `https://${domain}${pathName}`;
    const cookieParts = [
      `${cookie.name}=${cookie.value}`,
      `Domain=${domain}`,
      `Path=${pathName}`,
    ];

    if (cookie.httpOnly) {
      cookieParts.push("HttpOnly");
    }

    if (cookie.secure) {
      cookieParts.push("Secure");
    }

    try {
      jar.setCookieSync(cookieParts.join("; "), cookieUrl);
    } catch (error) {
      console.warn("Failed to restore cookie:", error?.message || error);
    }
  }

  return jar;
}

function normalizeAjaxPayload(payload) {
  if (payload && typeof payload === "object") {
    return payload;
  }

  if (typeof payload !== "string") {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
    });
  }

  const trimmedPayload = payload.trim();

  try {
    return JSON.parse(trimmedPayload);
  } catch {
    if (trimmedPayload.startsWith("<!DOCTYPE") || trimmedPayload.startsWith("<html")) {
      throw createAppError("Court server error", {
        statusCode: 502,
        code: "COURT_SERVER_ERROR",
        retryable: true,
      });
    }

    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
    });
  }
}

function detectNoData(payload, htmlText) {
  const combinedText = [
    payload?.errormsg,
    payload?.casetype_list,
    payload?.div_captcha,
    htmlText,
  ].filter(Boolean).join(" ").toLowerCase();

  return /record not found|no records? found|no data found|case code does not exists|case does not exists/.test(combinedText);
}

function validateCaptchaResponse(payload) {
  if (!payload || typeof payload !== "object") {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
    });
  }

  const errorMessage = String(payload.errormsg || "").toLowerCase();
  if (Number(payload.status) === 0 || errorMessage.includes("invalid captcha")) {
    throw createAppError("Invalid captcha", {
      statusCode: 400,
      code: "INVALID_CAPTCHA",
      retryable: false,
    });
  }

  const html = String(payload.casetype_list || "");
  if (!html.trim() && !payload.status && !payload.errormsg) {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
    });
  }

  if (detectNoData(payload, html)) {
    throw createAppError("No data found", {
      statusCode: 404,
      code: "NO_DATA_FOUND",
      retryable: false,
    });
  }

  return html;
}

async function createCaptchaSession(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);
  const { page } = await openEcourtsPage();

  try {
    if (normalizedCaseNumber) {
      await clearAndType(page, CNR_INPUT_SELECTOR, normalizedCaseNumber);
    }

    const captchaImage = await captureCaptchaImage(page);
    const cookies = sanitizeCookies(await page.cookies());
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const sessionId = randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + CAPTCHA_SESSION_TTL_MS;

    await storeSessionMetadata(sessionId, {
      sessionId,
      caseNumber: normalizedCaseNumber,
      cookies,
      headers: {
        "User-Agent": userAgent,
        Referer: ECOURTS_URL,
      },
      createdAt,
      expiresAt,
    });

    logScraperEvent("captcha_session_created", {
      sessionId,
      caseNumber: normalizedCaseNumber,
      hasCookies: cookies.length > 0,
      cookieCount: cookies.length,
      createdAt,
      expiresAt,
    });

    return {
      sessionId,
      caseNumber: normalizedCaseNumber,
      expiresAt,
      imageBuffer: captchaImage,
      imageBase64: captchaImage.toString("base64"),
    };
  } finally {
    await closePage(page);
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
    throw createAppError("Captcha expired", {
      statusCode: 410,
      code: "CAPTCHA_EXPIRED",
    });
  }

  await closeCaptchaSession(sessionId, session);
  return createCaptchaSession(session.caseNumber);
}

async function startScraper(caseNumber) {
  const session = await retry(() => getCachedCaptchaSession(caseNumber));
  return session.imageBuffer;
}

async function performScrapeRequest(session, normalizedCaseNumber, normalizedCaptcha) {
  const jar = buildAxiosCookieJar(session.cookies);
  const client = wrapper(axios.create({
    baseURL: ECOURTS_URL,
    jar,
    withCredentials: true,
    timeout: SCRAPE_TIMEOUT_MS,
    validateStatus: () => true,
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": session.headers?.["User-Agent"] || session.headers?.userAgent,
      Referer: session.headers?.Referer || ECOURTS_URL,
      Origin: "https://services.ecourts.gov.in",
      "X-Requested-With": "XMLHttpRequest",
    },
  }));

  const body = new URLSearchParams({
    cino: normalizedCaseNumber,
    fcaptcha_code: normalizedCaptcha,
    ajax_req: "true",
    app_token: "",
  });

  let response;

  try {
    response = await client.post(SEARCH_ENDPOINT, body.toString());
  } catch (error) {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
      details: { reason: error?.message || String(error) },
    });
  }

  if (response.status >= 500) {
    throw createAppError("Court server error", {
      statusCode: 502,
      code: "COURT_SERVER_ERROR",
      retryable: true,
      details: { responseStatus: response.status },
    });
  }

  const payload = normalizeAjaxPayload(response.data);

  logScraperEvent("captcha_submit_response", {
    sessionId: session.sessionId,
    status: response.status,
    hasCookies: Array.isArray(session.cookies) && session.cookies.length > 0,
  });

  return { response, payload };
}

async function submitCaptchaSolution({ sessionId, caseNumber, captcha }) {
  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedCaptcha = normalizeCaptcha(captcha);
  const session = await getSession(normalizedSessionId);

  if (!session) {
    throw createAppError("Captcha expired", {
      statusCode: 410,
      code: "CAPTCHA_EXPIRED",
    });
  }

  const normalizedCaseNumber = normalizeCaseNumber(caseNumber || session.caseNumber);
  if (!normalizedCaseNumber) {
    throw createAppError("caseNumber is required", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  if (!/^[A-Z0-9]{16}$/.test(normalizedCaseNumber)) {
    throw createAppError("caseNumber must be a 16 character alphanumeric CNR", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  if (!normalizedCaptcha) {
    throw createAppError("captcha is required", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  if (!/^[A-Z0-9]{4,8}$/.test(normalizedCaptcha)) {
    throw createAppError("captcha must be 4 to 8 alphanumeric characters", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  session.caseNumber = normalizedCaseNumber;
  session.sessionId = normalizedSessionId;

  await storeSessionMetadata(normalizedSessionId, {
    ...session,
    caseNumber: normalizedCaseNumber,
  });

  logScraperEvent("captcha_submit_start", {
    sessionId: normalizedSessionId,
    hasCookies: Array.isArray(session.cookies) && session.cookies.length > 0,
    cookieCount: Array.isArray(session.cookies) ? session.cookies.length : 0,
    captchaInput: normalizedCaptcha,
    caseNumber: normalizedCaseNumber,
  });

  let lastError = null;

  for (let attempt = 1; attempt <= DEFAULT_RETRYABLE_SUBMIT_ATTEMPTS; attempt += 1) {
    try {
      const { payload, response } = await performScrapeRequest(
        session,
        normalizedCaseNumber,
        normalizedCaptcha,
      );

      const html = validateCaptchaResponse(payload);
      const result = buildCaseFromHtml(normalizedCaseNumber, html);

      if (!result.rawText && !result.tables?.length) {
        throw createAppError("No data found", {
          statusCode: 404,
          code: "NO_DATA_FOUND",
          retryable: false,
        });
      }

      await closeCaptchaSession(normalizedSessionId, session);

      return {
        ok: true,
        code: "SUCCESS",
        message: "Case data fetched from eCourts.",
        responseStatus: response.status,
        case: result,
      };
    } catch (error) {
      lastError = error;

      logScraperEvent("captcha_submit_error", {
        sessionId: normalizedSessionId,
        attempt,
        statusCode: error?.statusCode || 500,
        error: error?.message || String(error),
      });

      if (error?.code === "INVALID_CAPTCHA") {
        await closeCaptchaSession(normalizedSessionId, session).catch(() => {});
        throw error;
      }

      if (!error?.retryable || attempt >= DEFAULT_RETRYABLE_SUBMIT_ATTEMPTS) {
        await closeCaptchaSession(normalizedSessionId, session).catch(() => {});
        throw error;
      }

      await sleep(500);
    }
  }

  await closeCaptchaSession(normalizedSessionId, session).catch(() => {});
  throw lastError || createAppError("Court server error", {
    statusCode: 502,
    code: "COURT_SERVER_ERROR",
    retryable: true,
  });
}

async function scrapeCase(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);

  if (!normalizedCaseNumber) {
    throw createAppError("caseNumber is required", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  if (!/^[A-Z0-9]{16}$/.test(normalizedCaseNumber)) {
    throw createAppError("caseNumber must be a 16 character alphanumeric CNR", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
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
scrapeCase.createAppError = createAppError;

module.exports = scrapeCase;
