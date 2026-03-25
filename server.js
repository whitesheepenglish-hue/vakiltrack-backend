require("./config/loadEnv");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

// Environment validation
const { validateEnv } = require("./config/validateEnv");
validateEnv();

const connectDB = require("./config/db");

// Initialize database connection
let dbConnection = null;
let isDbConnected = false;
let dbConnectionState = {
  connected: false,
  lastChecked: null,
  error: null
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
/* (async () => {
  try {
    dbConnection = await connectDB();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    // Don't exit - allow server to run with degraded functionality
  }
})(); */

async function connectDatabase() {
  try {
    dbConnection = await connectDB();
    console.log("Database connected successfully");
    return true;
  } catch (error) {
    // connectDB already applies exponential backoff and detailed error logging.
    console.error("Database connection failed:", error.message);
    dbConnectionState.error = error.message;
    dbConnectionState.lastChecked = new Date().toISOString();
    return false;
  }
}

connectDatabase();
const scrapeCase = require("./scrapers/ecourtScraper");
const {
  getCachedCaptchaSession,
  refreshCaptcha,
  submitCaptchaSolution,
} = scrapeCase;
const Case = require("./models/Case");
const caseRoutes = require("./routes/caseRoutes");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const { getCaptchaQueue: resolveCaptchaQueue, initializeQueue, isQueueHealthy, testQueueHealth } = require("./services/captchaQueue");
const { isRedisHealthy, pingRedis, redis } = require("./services/redis");
const { fetchCaseFromECourts } = require("./services/fetchCaseService");

const app = express();
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

// Graceful captcha queue check
async function getCaptchaQueue() {
  const queue = await initializeQueue().catch(() => resolveCaptchaQueue());
  return isQueueHealthy() ? queue : null;
}

// NOTE: BullMQ Worker moved to separate worker process (jobs/captchaWorker.js)
// Run: node scripts/runCaptchaWorkers.js

app.use(express.json());
app.use(cors());
app.use(apiRateLimit);
app.use("/api/cases", caseRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

/* ---------------- ROUTES ---------------- */

// Home
app.get("/", (req, res) => {
  res.json({
    status: "VakilTrack API running",
    dbConnected: isDbConnected,
    redisHealthy: true
  });
});

app.get("/health", async (req, res) => {
  const dbConnected = isDbConnected;
  const redisHealthy = isRedisHealthy();
  const queueHealthy = isQueueHealthy();
  
  // Test actual Redis connectivity with ping
  let redisPing = false;
  try {
    redisPing = await pingRedis();
  } catch (e) {
    // ping failed
  }
  
  // Test actual queue operations
  let queueTest = false;
  try {
    queueTest = await testQueueHealth();
  } catch (e) {
    // queue test failed
  }
  
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
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

// USERS
app.get("/api/users", (req, res) => {
  res.json({ message: "Users API working" });
});

// LOGIN
app.get("/api/login", (req, res) => {
  res.json({ message: "Login API working" });
});

app.get("/api/captcha", async (req, res) => {
  try {
    const caseNumber = String(req.query.caseNumber || "").trim();
    const challenge = await getCachedCaptchaSession(caseNumber);

    return res.json({
      status: "ready",
      sessionId: challenge.sessionId,
      caseNumber: challenge.caseNumber,
      expiresAt: challenge.expiresAt,
      captchaImageBase64: challenge.imageBase64,
      note: "Solve this live captcha immediately, then POST sessionId, caseNumber, and captcha to /api/scrape/manual on this same API instance.",
    });
  } catch (error) {
    console.error("CAPTCHA ERROR:", error);
    return res.status(500).json({
      error: "Captcha session creation failed",
      detail: String(error?.message || error),
    });
  }
});

app.post("/api/captcha/refresh", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();

    if (!sessionId) {
      return res.status(400).json({
        error: "sessionId is required",
      });
    }

    const refreshed = await refreshCaptcha(sessionId);

    return res.json({
      status: "ready",
      sessionId: refreshed.sessionId,
      caseNumber: refreshed.caseNumber,
      expiresAt: refreshed.expiresAt,
      captchaImageBase64: refreshed.imageBase64,
    });
  } catch (error) {
    console.error("CAPTCHA REFRESH ERROR:", error);
    return res.status(400).json({
      error: String(error?.message || error),
    });
  }
});

app.get("/api/captcha/result/:jobId", async (req, res) => {
  const queue = await getCaptchaQueue();

  if (!queue) {
    return res.status(503).json({
      error: "Captcha service unavailable",
      message: "Redis queue is not healthy. Cannot fetch job result.",
    });
  }

  try {
    const job = await queue.getJob(req.params.jobId);

    if (!job) return res.json({ status: "not_found" });

    const state = await job.getState();

    if (state !== "completed") {
      return res.json({ status: state });
    }

    return res.json({
      status: "completed",
      data: job.returnvalue
    });
  } catch (error) {
    console.error("CAPTCHA RESULT ERROR:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/job/:id", async (req, res) => {
  const queue = await getCaptchaQueue();

  if (!queue) {
    return res.status(503).json({
      error: "Job service unavailable",
      message: "Redis queue is not healthy. Cannot fetch job status.",
    });
  }

  try {
    const job = await queue.getJob(req.params.id);

    if (!job) {
      return res.status(404).send("Not found");
    }

    return res.json({
      state: await job.getState(),
      result: job.returnvalue,
    });
  } catch (error) {
    console.error("JOB STATUS ERROR:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

app.post("/api/fetch-case", async (req, res) => {
  try {
    console.log("📥 Fetch केस request:", req.body);

    const result = await fetchCaseFromECourts(req.body);

    res.json(result);
  } catch (error) {
    console.error("❌ Final Failure:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed after retries",
      error: error.message,
    });
  }
});

app.post("/api/scrape/manual", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const caseNumber = String(req.body?.caseNumber || "").trim();
    const captcha = String(req.body?.captcha || "").trim();

    if (!sessionId) {
      return res.status(400).json({
        message: "Manual captcha submission failed",
        error: "sessionId is required. Request /api/captcha?format=json first to create a live captcha session.",
      });
    }

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

    return res.json({
      ...result,
      savedToDb,
    });
  } catch (error) {
    console.error("Manual scraper error:", error?.message || error);
    return res.status(400).json({
      message: "Manual captcha submission failed",
      error: String(error?.message || error),
    });
  }
});

// SCRAPER
app.get("/api/scrape/:caseno", async (req, res) => {
  try {
    const caseno = req.params.caseno;

    console.log("Creating captcha challenge for case:", caseno);

    const data = await scrapeCase(caseno);

    res.json({
      message: data.captchaRequired
        ? "Manual captcha required. Request /api/captcha?caseNumber=<CNR>&format=json, solve that live captcha, then POST sessionId, caseNumber, and captcha to /api/scrape/manual."
        : "Case processed",
      savedToDb: false,
      case: data,
    });
  } catch (error) {
    console.error("Scraper error:", error?.message || error);

    res.status(500).json({
      message: "Scraper error",
      error: String(error?.message || error),
    });
  }
});

// DOCUMENTS
app.get("/api/documents", (req, res) => {
  res.json({ message: "Documents API working" });
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
