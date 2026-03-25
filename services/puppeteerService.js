const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getNextProxy } = require('../utils/proxyPool');

puppeteer.use(StealthPlugin());

let browser;

const getBrowser = async () => {
    if (!browser) {
        const proxyUrl = getNextProxy();

        browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", `--proxy-server=${proxyUrl}`]
        });
    }

    return browser;
};

const fetchCaseWithBrowser = async (payload) => {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
        await page.goto(
            "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
            { waitUntil: "networkidle2" }
        );

        // Fill form
        await page.select('select[name="dist_code"]', payload.dist_code);
        await page.select('select[name="court_code"]', payload.court_code);
        await page.select('select[name="case_type"]', payload.case_type);

        await page.type('input[name="case_no"]', payload.case_number);
        await page.type('input[name="case_year"]', payload.year);

        // ⚠️ CAPTCHA (manual or OCR)
        await page.type('input[name="captcha"]', payload.captcha);

        // Submit
        await Promise.all([
            page.click('#searchbtn'),
            page.waitForNavigation({ waitUntil: "networkidle2" })
        ]);

        const html = await page.content();

        if (!html || html.length < 500) {
            throw new Error("Blocked / Empty page");
        }

        return {
            success: true,
            html
        };

    } catch (error) {
        console.error("Puppeteer Error:", error.message);
        return {
            success: false,
            message: error.message
        };
    } finally {
        await page.close();
    }
};

module.exports = { fetchCaseWithBrowser };
