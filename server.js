const express = require("express");
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

// SCRAPER
app.get("/api/scrape/:caseno", async (req, res) => {
  try {
    const caseno = req.params.caseno;

    console.log("Scraping started...");
    console.log("Scraping case:", caseno);

    const data = await scrapeCase(caseno);

    let savedToDb = false;

    // Save to DB if connected; don't block the response if DB is down.
    if (Case?.db?.readyState === 1) {
      try {
        const newCase = new Case({
          caseNumber: data.caseNumber,
          partyName: [data.petitioner, data.respondent].filter(Boolean).join(" vs "),
          court: data.court,
          nextHearingDate: data.nextHearing,
          lastUpdated: new Date(),
        });

        await newCase.save();
        savedToDb = true;
        console.log("Data saved to MongoDB");
      } catch (saveErr) {
        console.error("MongoDB save failed:", saveErr?.message || saveErr);
      }
    }

    res.json({
      message: "Case processed",
      savedToDb,
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
