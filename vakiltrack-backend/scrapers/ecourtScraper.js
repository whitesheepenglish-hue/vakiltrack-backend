const puppeteer = require("puppeteer");

let browser;
let page;

async function startScraper() {
    console.log("Scraper started...");

    browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox"]
    });

    page = await browser.newPage();

    await page.goto("https://services.ecourts.gov.in/ecourtindia_v6/");

    console.log("Court website opened");

    // Wait for captcha element
    await page.waitForSelector("#captcha_image");

    // screenshot captcha
    const captcha = await page.$("#captcha_image");
    await captcha.screenshot({ path: "captcha.png" });

    return "captcha.png";
}

async function submitCaptcha(caseNumber, captchaText) {

    await page.type("#case_no", caseNumber);

    await page.type("#captcha", captchaText);

    await page.click("#searchbtn");

    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {

        return {
            caseNumber: document.querySelector("#caseNumber")?.innerText || "",
            petitioner: document.querySelector("#petitioner")?.innerText || "",
            respondent: document.querySelector("#respondent")?.innerText || "",
            nextHearing: document.querySelector("#nextHearing")?.innerText || "",
            court: "Chennai District Court"
        };

    });

    const cases = data ? [data] : [];
    console.log("Fetched cases:", cases.length);

    await browser.close();

    return data;
}

module.exports = { startScraper, submitCaptcha };
