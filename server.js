const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const fs = require("node:fs");
const path = require("node:path");
let dotenv;
try {
  dotenv = require("dotenv");
} catch {
  dotenv = null;
}
const scrapeCase = require("./scrapers/ecourtScraper");
const {
  submitCaptchaSolution,
} = scrapeCase;
const Case = require("./models/Case");
const caseRoutes = require("./routes/caseRoutes");
const { captchaQueue, captchaQueueEvents } = require("./services/captchaQueue");

const app = express();
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

const isDbConnected = () => Case?.db?.readyState === 1;

/* ---------------- ENV ---------------- */

// Load .env from common locations so it works whether you run from repo root
// or from the nested `vakiltrack-backend/` folder.
const envCandidates = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", ".env"),
  path.join(process.cwd(), "..", ".env"),
];

for (const envPath of envCandidates) {
  if (dotenv && fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true });
}

let dbConnection;
try {
  dbConnection = connectDB();
} catch (err) {
  dbConnection = Promise.reject(err);
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
  });
});

app.get("/health", (req, res) => {
  res.send("OK");
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
    const job = await captchaQueue.add("generate", { caseNumber });
    const result = await job.waitUntilFinished(captchaQueueEvents);

    return res.json(result);
  } catch (error) {
    console.error("CAPTCHA ERROR:", error);
    return res.status(500).json({
      error: error.message,
      hint: "Make sure Redis is running and the BullMQ captcha worker is online before requesting /api/captcha.",
    });
  }
});

app.get("/api/job/:id", async (req, res) => {
  try {
    const job = await captchaQueue.getJob(req.params.id);

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

const PORT = process.env.PORT || 5000;

(async () => {
  app.locals.dbConnected = false;

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  try {
    await dbConnection;
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
