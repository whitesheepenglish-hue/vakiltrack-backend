const puppeteer = require("puppeteer");
const Case = require("../models/Case");

async function runScraper(caseNumber){

    console.log("Scraper started...");

    const browser = await puppeteer.launch({
        headless:true,
        args:["--no-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://services.ecourts.gov.in/ecourtindia_v6/");

    console.log("Court website opened");

    // example case data
    const caseData = {
        caseNumber: caseNumber,
        partyName: "Demo Petitioner vs Demo Respondent",
        court: "Chennai District Court",
        nextHearingDate: "2026-04-10",
        lastUpdated: new Date()
    };

    const cases = caseData ? [caseData] : [];
    console.log("Fetched cases:", cases.length);

    const newCase = new Case(caseData);
    await newCase.save();

    console.log("Saved to DB");

    await browser.close();

}

module.exports = runScraper;
