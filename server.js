require("./config/loadEnv");
const express = require("express");
const cors = require("cors");
const rateLimitPackage = require("express-rate-limit");
const mongoose = require("mongoose");

const { validateEnv } = require("./config/validateEnv");
validateEnv();

const connectDB = require("./config/db");
const scrapeCase = require("./scrapers/ecourtScraper");
const Case = require("./models/Case");
const caseRoutes = require("./routes/caseRoutes");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const { getCaptchaQueue: resolveCaptchaQueue, initializeQueue, isQueueHealthy, testQueueHealth } = require("./services/captchaQueue");
const { isRedisHealthy, pingRedis, redis } = require("./services/redis");

const rateLimit = rateLimitPackage;
const { ipKeyGenerator } = rateLimitPackage;
const {
  getCachedCaptchaSession,
  refreshCaptcha,
  submitCaptchaSolution,
} = scrapeCase;

let dbConnection = null;
let isDbConnected = false;
let dbConnectionState = {
  connected: false,
  lastChecked: null,
  error: null,
};

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
  isDbConnected = true;
  dbConnectionState.connected = true;
  dbConnectionState.lastChecked = new Date().toISOString();
  dbConnectionState.error = null;
});

mongoose.connection.on("disconnected", () => {
  isDbConnected = false;
  dbConnectionState.connected = false;
  dbConnectionState.lastChecked = new Date().toISOString();
});

async function connectDatabase() {
  try {
    dbConnection = await connectDB();
    console.log("Database connected successfully");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error.message);
    dbConnectionState.error = error.message;
    dbConnectionState.lastChecked = new Date().toISOString();
    return false;
  }
}

connectDatabase();

const app = express();
app.set("trust proxy", 1);

function getRequesterKey(req) {
  const firebaseUid = String(
    req.headers["x-firebase-uid"]
    || req.headers["firebase-uid"]
    || req.user?.uid
    || "",
  ).trim();

  if (firebaseUid) {
    return `uid:${firebaseUid}`;
  }

  return `ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || "")}`;
}

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function sendError(res, error, fallbackStatusCode = 500) {
  const message = typeof error === "string"
    ? error
    : String(error?.message || "Court server error");
  const statusCode = Number(error?.statusCode || fallbackStatusCode || 500);

  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

function validateSessionId(sessionId) {
  return /^[0-9a-f-]{36}$/i.test(String(sessionId || "").trim());
}

function validateCaseNumber(caseNumber) {
  return /^[A-Z0-9]{16}$/.test(String(caseNumber || "").trim().toUpperCase());
}

function validateCaptcha(captcha) {
  return /^[A-Z0-9]{4,8}$/.test(String(captcha || "").trim().toUpperCase());
}

function logApiEvent(event, payload = {}) {
  console.log(`[api] ${event}`, payload);
}

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRequesterKey(req),
  handler: (req, res) => sendError(res, { message: "Too many requests", statusCode: 429 }, 429),
});

async function getCaptchaQueue() {
  const queue = await initializeQueue().catch(() => resolveCaptchaQueue());
  return isQueueHealthy() ? queue : null;
}

app.use(express.json());
app.use(cors());
app.use(apiRateLimit);
app.use("/api/cases", caseRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req, res) => {
  res.json({
    status: "VakilTrack API running",
    dbConnected: isDbConnected,
    redisHealthy: true,
  });
});

app.get("/health", async (req, res) => {
  const dbConnected = isDbConnected;
  const redisHealthy = isRedisHealthy();
  const queueHealthy = isQueueHealthy();

  let redisPing = false;
  try {
    redisPing = await pingRedis();
  } catch {}

  let queueTest = false;
  try {
    queueTest = await testQueueHealth();
  } catch {}

  const health = {
    status: dbConnected && redisHealthy ? "OK" : "DEGRADED",
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbConnected ? "connected" : "disconnected",
        readyState: mongoose.connection?.readyState || 0,
        readyStateLabel: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection?.readyState || 0],
        lastChecked: dbConnectionState.lastChecked,
      },
      redis: {
        status: redisHealthy ? "healthy" : "unhealthy",
        ping: redisPing ? "PONG" : "FAILED",
        statusDetail: redis?.status || "not initialized",
        urlConfigured: !!process.env.REDIS_URL,
      },
      queue: {
        status: queueHealthy ? "healthy" : "unhealthy",
        operationsTest: queueTest ? "OK" : "FAILED",
        queueInitialized: !!resolveCaptchaQueue(),
      },
    },
  };

  const allHealthy = dbConnected && redisHealthy && queueHealthy;
  return res.status(allHealthy ? 200 : 503).json(health);
});

app.get("/api/users", (req, res) => {
  res.json({ message: "Users API working" });
});

app.get("/api/login", (req, res) => {
  res.json({ message: "Login API working" });
});

app.get("/api/captcha", async (req, res) => {
  try {
    const caseNumber = String(req.query.caseNumber || "").trim().toUpperCase();

    if (caseNumber && !validateCaseNumber(caseNumber)) {
      return sendError(res, { message: "caseNumber must be a 16 character alphanumeric CNR", statusCode: 400 }, 400);
    }

    const challenge = await getCachedCaptchaSession(caseNumber);
    logApiEvent("captcha_created", {
      requester: getRequesterKey(req),
      sessionId: challenge.sessionId,
      caseNumber: challenge.caseNumber,
    });

    return sendSuccess(res, {
      sessionId: challenge.sessionId,
      caseNumber: challenge.caseNumber,
      expiresAt: challenge.expiresAt,
      captchaImageBase64: challenge.imageBase64,
      note: "Solve this live captcha immediately, then POST sessionId, caseNumber, and captcha to /api/scrape/manual.",
    });
  } catch (error) {
    console.error("CAPTCHA ERROR:", error);
    return sendError(res, { message: "Court server error", statusCode: error?.statusCode || 500 }, 500);
  }
});

app.post("/api/captcha/refresh", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();

    if (!validateSessionId(sessionId)) {
      return sendError(res, { message: "sessionId is required", statusCode: 400 }, 400);
    }

    const refreshed = await refreshCaptcha(sessionId);
    logApiEvent("captcha_refreshed", {
      requester: getRequesterKey(req),
      sessionId: refreshed.sessionId,
      caseNumber: refreshed.caseNumber,
    });

    return sendSuccess(res, {
      sessionId: refreshed.sessionId,
      caseNumber: refreshed.caseNumber,
      expiresAt: refreshed.expiresAt,
      captchaImageBase64: refreshed.imageBase64,
    });
  } catch (error) {
    console.error("CAPTCHA REFRESH ERROR:", error);
    return sendError(res, error, 400);
  }
});

app.get("/api/captcha/result/:jobId", async (req, res) => {
  const queue = await getCaptchaQueue();

  if (!queue) {
    return sendError(res, { message: "Captcha service unavailable", statusCode: 503 }, 503);
  }

  try {
    const job = await queue.getJob(req.params.jobId);

    if (!job) {
      return sendSuccess(res, { status: "not_found" });
    }

    const state = await job.getState();
    if (state !== "completed") {
      return sendSuccess(res, { status: state });
    }

    return sendSuccess(res, {
      status: "completed",
      result: job.returnvalue,
    });
  } catch (error) {
    console.error("CAPTCHA RESULT ERROR:", error);
    return sendError(res, error, 500);
  }
});

app.get("/api/job/:id", async (req, res) => {
  const queue = await getCaptchaQueue();

  if (!queue) {
    return sendError(res, { message: "Job service unavailable", statusCode: 503 }, 503);
  }

  try {
    const job = await queue.getJob(req.params.id);

    if (!job) {
      return sendError(res, { message: "No data found", statusCode: 404 }, 404);
    }

    return sendSuccess(res, {
      state: await job.getState(),
      result: job.returnvalue,
    });
  } catch (error) {
    console.error("JOB STATUS ERROR:", error);
    return sendError(res, error, 500);
  }
});

app.post("/api/fetch-case", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const caseNumber = String(req.body?.caseNumber || req.body?.case_number || "").trim().toUpperCase();
    const captcha = String(req.body?.captcha || "").trim().toUpperCase();

    logApiEvent("fetch_case_request", {
      requester: getRequesterKey(req),
      sessionId,
      caseNumber,
      hasCaptcha: Boolean(captcha),
    });

    if (!caseNumber) {
      return sendError(res, { message: "caseNumber is required", statusCode: 400 }, 400);
    }

    if (!validateCaseNumber(caseNumber)) {
      return sendError(res, { message: "caseNumber must be a 16 character alphanumeric CNR", statusCode: 400 }, 400);
    }

    if (!sessionId || !captcha) {
      const challenge = await getCachedCaptchaSession(caseNumber);

      return sendSuccess(res, {
        captchaRequired: true,
        sessionId: challenge.sessionId,
        caseNumber: challenge.caseNumber,
        expiresAt: challenge.expiresAt,
        captchaImageBase64: challenge.imageBase64,
      });
    }

    if (!validateSessionId(sessionId)) {
      return sendError(res, { message: "sessionId is required", statusCode: 400 }, 400);
    }

    if (!validateCaptcha(captcha)) {
      return sendError(res, { message: "captcha must be 4 to 8 alphanumeric characters", statusCode: 400 }, 400);
    }

    const result = await submitCaptchaSolution({ sessionId, caseNumber, captcha });
    return sendSuccess(res, result.case);
  } catch (error) {
    console.error("FETCH CASE ERROR:", error?.message || error);
    return sendError(res, error, 500);
  }
});

app.post("/api/scrape/manual", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const caseNumber = String(req.body?.caseNumber || "").trim().toUpperCase();
    const captcha = String(req.body?.captcha || "").trim().toUpperCase();

    if (!validateSessionId(sessionId)) {
      return sendError(res, { message: "sessionId is required", statusCode: 400 }, 400);
    }

    if (!validateCaseNumber(caseNumber)) {
      return sendError(res, { message: "caseNumber must be a 16 character alphanumeric CNR", statusCode: 400 }, 400);
    }

    if (!validateCaptcha(captcha)) {
      return sendError(res, { message: "captcha must be 4 to 8 alphanumeric characters", statusCode: 400 }, 400);
    }

    logApiEvent("manual_scrape_request", {
      requester: getRequesterKey(req),
      sessionId,
      caseNumber,
      captchaInput: captcha,
    });

    const result = await submitCaptchaSolution({
      sessionId,
      caseNumber,
      captcha,
    });

    const caseData = result.case;
    let savedToDb = false;

    if (caseData && result.ok && result.code === "SUCCESS" && isDbConnected) {
      try {
        const newCase = new Case({
          caseNumber: caseData.caseNumber,
          partyName: [caseData.petitioner, caseData.respondent].filter(Boolean).join(" vs "),
          court: caseData.court,
          nextHearingDate: caseData.nextHearing,
          lastUpdated: new Date(),
        });

        await newCase.save();
        savedToDb = true;
      } catch (saveErr) {
        console.error("MongoDB save failed:", saveErr?.message || saveErr);
      }
    }

    return sendSuccess(res, {
      ...caseData,
      savedToDb,
    });
  } catch (error) {
    console.error("Manual scraper error:", error?.message || error);
    return sendError(res, error, 400);
  }
});

app.get("/api/scrape/:caseno", async (req, res) => {
  try {
    const caseNumber = String(req.params.caseno || "").trim().toUpperCase();
    logApiEvent("scrape_case_request", {
      requester: getRequesterKey(req),
      caseNumber,
    });

    const data = await scrapeCase(caseNumber);

    return sendSuccess(res, {
      ...data,
      savedToDb: false,
    });
  } catch (error) {
    console.error("Scraper error:", error?.message || error);
    return sendError(res, error, 500);
  }
});

app.get("/api/documents", (req, res) => {
  res.json({ message: "Documents API working" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
