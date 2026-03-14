const puppeteer = require("puppeteer");

async function scrapeCase(caseNumber){

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox"
  ]
});

const page = await browser.newPage();

await page.goto("https://services.ecourts.gov.in/");

await page.waitForTimeout(5000);

const data = {
  petitioner: "Sample Petitioner",
  respondent: "Sample Respondent",
  nextHearing: "15-04-2026",
  court: "Chennai District Court"
};

await browser.close();

return data;

}

module.exports = scrapeCase;