const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeCase(caseNumber){
console.log("Scraper started...");

const url = "https://services.ecourts.gov.in/ecourtindia_v6/case_status.php";

const response = await axios.get(url);

const html = response.data;

const $ = cheerio.load(html);

const caseData = {
 caseNumber: caseNumber,
 petitioner: "Demo Petitioner",
 respondent: "Demo Respondent",
 nextHearing: "20-04-2026",
 court: "Chennai District Court"
};

const cases = caseData ? [caseData] : [];
console.log("Fetched cases:", cases.length);

return caseData;

}

module.exports = scrapeCase;
