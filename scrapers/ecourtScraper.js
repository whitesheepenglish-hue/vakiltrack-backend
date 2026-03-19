const { randomUUID } = require("node:crypto");
const puppeteer = require("puppeteer");

const ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
const CAPTCHA_SELECTOR = "#captcha_image";
const CNR_INPUT_SELECTOR = "#cino";
const CAPTCHA_INPUT_SELECTOR = "#fcaptcha_code";
const SEARCH_BUTTON_SELECTOR = "#searchbtn";
const CAPTCHA_SESSION_TTL_MS = 10 * 60 * 1000;
const captchaSessions = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeCaseNumber = (caseNumber) => String(caseNumber || "").trim().toUpperCase();
const normalizeCaptcha = (captcha) => String(captcha || "").trim();

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

function getSession(id) {
  if (!id) {
    return null;
  }

  const session = captchaSessions.get(id) || null;
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    closeCaptchaSession(id).catch(() => {});
    return null;
  }

  return session;
}

async function closeCaptchaSession(sessionId) {
  const session = captchaSessions.get(sessionId);
  captchaSessions.delete(sessionId);

  if (!session) {
    return;
  }

  clearTimeout(session.timeoutHandle);

  await session.browser?.close().catch(() => {});
}

function scheduleSessionCleanup(sessionId) {
  return setTimeout(() => {
    closeCaptchaSession(sessionId).catch(() => {});
  }, CAPTCHA_SESSION_TTL_MS);
}

async function captureCaptchaImage(page) {
  await page.waitForSelector(CAPTCHA_SELECTOR, { timeout: 15_000 });

  const captchaElement = await page.$(CAPTCHA_SELECTOR);
  if (!captchaElement) {
    throw new Error("Captcha image element not found on eCourts page.");
  }

  return captchaElement.screenshot({ type: "png" });
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}

async function openEcourtsPage() {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(ECOURTS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await page.waitForSelector(CNR_INPUT_SELECTOR, { timeout: 15_000 });
  await page.waitForSelector(CAPTCHA_INPUT_SELECTOR, { timeout: 15_000 });
  await page.waitForSelector(SEARCH_BUTTON_SELECTOR, { timeout: 15_000 });

  return { browser, page };
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
  const { browser, page } = await openEcourtsPage();

  try {
    if (normalizedCaseNumber) {
      await page.fill(CNR_INPUT_SELECTOR, normalizedCaseNumber);
    }

    const captchaImage = await captureCaptchaImage(page);
    const sessionId = randomUUID();
    const expiresAt = Date.now() + CAPTCHA_SESSION_TTL_MS;
    const timeoutHandle = scheduleSessionCleanup(sessionId);

    captchaSessions.set(sessionId, {
      browser,
      page,
      caseNumber: normalizedCaseNumber,
      expiresAt,
      timeoutHandle,
    });

    return {
      sessionId,
      caseNumber: normalizedCaseNumber,
      expiresAt,
      imageBuffer: captchaImage,
      imageBase64: captchaImage.toString("base64"),
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

async function refreshCaptcha(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Captcha session expired or was not found.");
  }

  const imageBuffer = await captureCaptchaImage(session.page);
  return {
    sessionId,
    caseNumber: session.caseNumber,
    expiresAt: session.expiresAt,
    imageBuffer,
    imageBase64: imageBuffer.toString("base64"),
  };
}

async function startScraper(caseNumber) {
  const session = await createCaptchaSession(caseNumber);
  return session.imageBuffer;
}

async function submitCaptchaSolution({ sessionId, caseNumber, captcha }) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Captcha session expired or was not found. Request a new captcha and try again.");
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

  const { page } = session;

  await page.fill(CNR_INPUT_SELECTOR, normalizedCaseNumber);
  await page.fill(CAPTCHA_INPUT_SELECTOR, normalizedCaptcha);
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
      sessionId,
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
}

async function scrapeCase(caseNumber) {
  const normalizedCaseNumber = normalizeCaseNumber(caseNumber);

  if (!normalizedCaseNumber) {
    throw new Error("caseNumber is required");
  }

  try {
    const challenge = await createCaptchaSession(normalizedCaseNumber);

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
scrapeCase.refreshCaptcha = refreshCaptcha;
scrapeCase.submitCaptchaSolution = submitCaptchaSolution;
scrapeCase.closeCaptchaSession = closeCaptchaSession;

module.exports = scrapeCase;
