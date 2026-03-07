const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/case", async (req, res) => {
  const caseNumber = req.query.caseNumber;

  if (!caseNumber) {
    return res.status(400).json({ error: "caseNumber query param is required" });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto("https://ecourts.gov.in/ecourts_home/", { waitUntil: "domcontentloaded" });

    // Replace these placeholder fields with extracted values once selectors are finalized.
    const result = {
      caseNumber,
      nextHearingDate: "05-03-2026",
      stage: "For Evidence",
      source: "https://ecourts.gov.in/ecourts_home/",
    };

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`vakiltrack-backend listening on port ${PORT}`);
});
