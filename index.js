const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/case", async (req, res) => {
  const caseNumber = req.query.caseNumber;

  if (!caseNumber) {
    return res.json({ error: "Case number required" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://ecourts.gov.in/ecourts_home/");

    // ⚠️ IMPORTANT:
    // You must inspect website and update selectors below

    // Example fake response (replace later with real scraping)
    const result = {
      caseNumber: caseNumber,
      nextHearingDate: "05-03-2026",
      stage: "For Evidence"
    };

    await browser.close();

    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});