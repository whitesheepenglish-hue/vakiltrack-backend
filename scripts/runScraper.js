const scrapeCase = require("../scrapers/ecourtScraper");

const caseNumber = String(process.argv[2] || "").trim();

if (!caseNumber) {
  console.error("Usage: npm run scrape -- <caseNumber>");
  process.exit(1);
}

(async () => {
  try {
    const result = await scrapeCase(caseNumber);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
})();
