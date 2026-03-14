const puppeteer = require("puppeteer");

async function scrapeCase(caseNumber){

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage"
  ]
});

const page = await browser.newPage();

await page.setUserAgent(
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
);

await page.goto("https://services.ecourts.gov.in/", {
  waitUntil:"networkidle2"
});

await new Promise(r=>setTimeout(r,5000));

const data = {
  caseNumber,
  petitioner:"Sample Petitioner",
  respondent:"Sample Respondent",
  nextHearing:"20-04-2026",
  court:"Chennai District Court"
};

await browser.close();

return data;

}

module.exports = scrapeCase;