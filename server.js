const express = require("express");
const cors = require("cors");
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
  createCaptchaSession,
  submitCaptchaSolution,
} = scrapeCase;
const Case = require("./models/Case");
const caseRoutes = require("./routes/caseRoutes");

const app = express();

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
app.use("/api/cases", caseRoutes);

/* ---------------- ROUTES ---------------- */

// Home
app.get("/", (req, res) => {
  res.json({
    status: "VakilTrack API running",
    dbConnected: isDbConnected(),
  });
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
    const asJson = String(req.query.format || "").toLowerCase() === "json";
    const captchaSession = await createCaptchaSession(caseNumber);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("X-Captcha-Session-Id", captchaSession.sessionId);
    res.set("X-Captcha-Expires-At", String(captchaSession.expiresAt));

    if (asJson) {
      return res.json({
        contentType: "image/png",
        sessionId: captchaSession.sessionId,
        caseNumber: captchaSession.caseNumber,
        expiresAt: captchaSession.expiresAt,
        imageBase64: captchaSession.imageBase64,
      });
    }

    res.type("png");
    return res.send(captchaSession.imageBuffer);

  } catch (error) {
    console.error("CAPTCHA ERROR:", error);
    return res.status(500).json({
      error: error.message,
      hint: "Make sure Render installs Puppeteer's browser during build, then request /api/captcha?format=json to get a live captcha session before submitting the solved captcha.",
    });
  }
});

app.post("/api/scrape/manual", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const caseNumber = String(req.body?.caseNumber || "").trim();
    const captcha = String(req.body?.captcha || "").trim();

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
        ? "Manual captcha required. Solve the returned captcha and POST it to /api/scrape/manual."
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

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

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
