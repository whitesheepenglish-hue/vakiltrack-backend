const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

require("./config/loadEnv");

// Environment validation
const { validateEnv } = require("./config/validateEnv");
validateEnv();

const connectDB = require("./config/db");
const scrapeCase = require("./scrapers/ecourtScraper");
const {
  submitCaptchaSolution,
} = scrapeCase;
const Case = require("./models/Case");
const caseRoutes = require("./routes/caseRoutes");
const { captchaQueue, connection, isQueueHealthy } = require("./services/captchaQueue");
const { isRedisHealthy } = require("./services/redis");

const app = express();
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

const isDbConnected = () => Case?.db?.readyState === 1;

// Graceful captcha queue check
function getCaptchaQueue() {
  return isQueueHealthy() ? captchaQueue : null;
}

app.use(express.json());
app.use(cors());
app.use(apiRateLimit);
app.use("/api/cases", caseRoutes);

/* ---------------- ROUTES ---------------- */

// Home
app.get("/", (req, res) => {
  res.json({
    status: "VakilTrack API running",
    dbConnected: isDbConnected(),
    redisHealthy: isRedisHealthy(),
    queueHealthy: isQueueHealthy(),
  });
});

app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    services: {
      database: isDbConnected() ? "connected" : "disconnected",
      redis: isRedisHealthy() ? "healthy" : "unhealthy",
      queue: isQueueHealthy() ? "healthy" : "unhealthy",
    },
  };

  const allHealthy = Object.values(health.services).every(s => s === "connected" || s === "healthy");
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
  const queue = getCaptchaQueue();

  if (!queue) {
    return res.status(503).json({
      error: "Captcha service unavailable",
      message: "Redis queue is not healthy. Please check your Redis configuration.",
      redisHealthy: isRedisHealthy(),
      queueHealthy: isQueueHealthy(),
    });
  }

  try {
    const caseNumber = String(req.query.caseNumber || "").trim();
    const job = await queue.add("generate", { caseNumber });

    return res.json({
      jobId: job.id,
      status: "queued"
    });
  } catch (error) {
    console.error("CAPTCHA ERROR:", error);
    const redisUrl = String(process.env.REDIS_URL || "").trim();
    const hint = redisUrl
      ? `Redis is configured as ${redisUrl}. Make sure that Redis is reachable and the BullMQ captcha worker is online before requesting /api/captcha.`
      : "REDIS_URL is not set. Configure a reachable Redis instance and start the BullMQ captcha worker before requesting /api/captcha.";
    return res.status(500).json({
      error: error.message,
      hint,
    });
  }
});

app.get("/api/captcha/result/:jobId", async (req, res) => {
  const queue = getCaptchaQueue();

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
  const queue = getCaptchaQueue();

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

    if (caseData && result.ok && result.code === "SUCCESS" && Case?.db?.readyState === 1) {
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

const PORT = process.env.PORT || 10000;

(async () => {
  app.locals.dbConnected = false;

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  try {
    await connectDB();
    app.locals.dbConnected = true;
  } catch (err) {
    console.error("MongoDB Error:", err?.message || err);
    if (String(process.env.REQUIRE_DB || "").toLowerCase() === "true") {
      server.close(() => {
        process.exitCode = 1;
      });
      return;
    }
    console.warn("MongoDB is unavailable; continuing without DB (set REQUIRE_DB=true to fail-fast).");
  }
})();
