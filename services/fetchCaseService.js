const axios = require('axios');
const cheerio = require('cheerio');
const retry = require('../utils/retry');
const { getNextProxy, markProxyFailure } = require('../utils/proxyPool');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { fetchCaseWithBrowser } = require('./puppeteerService');

const parseHtml = (html) => {
    const $ = cheerio.load(html);

    return {
        parties: $("table:contains('Petitioner')").text().trim(),
        status: $("table:contains('Status')").text().trim()
    };
};

const retryAxiosFlow = async (payload) => {
    return retry(async () => {
        const proxyUrl = getNextProxy();
        console.log("🌐 Using Proxy:", proxyUrl);

        const agent = new HttpsProxyAgent(proxyUrl);

        const {
            dist_code,
            court_code,
            case_type,
            case_number,
            year,
            captcha,
            session_id
        } = payload;

        const url = "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index";

        const formData = new URLSearchParams();
        formData.append("dist_code", dist_code);
        formData.append("court_code", court_code);
        formData.append("case_type", case_type);
        formData.append("case_no", case_number);
        formData.append("case_year", year);
        formData.append("captcha", captcha);

        let response;

        try {
            response = await axios.post(url, formData, {
                httpsAgent: agent,
                proxy: false, // IMPORTANT when using agent
                timeout: 10000,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0",
                    "Cookie": `PHPSESSID=${session_id}`
                }
            });
        } catch (err) {
            markProxyFailure(proxyUrl);
            throw err;
        }

        const html = response.data;

        // Basic block detection
        if (!html || html.length < 500) {
            throw new Error("Blocked / Empty response");
        }

        return {
            success: true,
            data: parseHtml(html)
        };

    }, {
        retries: 5,
        delay: 2000,
        factor: 2,
        onRetry: (err, attempt) => {
            console.log(`🔁 Retry ${attempt}: ${err.message}`);
        }
    });
};

const fetchCaseFromECourts = async (payload) => {
    try {
        const result = await retryAxiosFlow(payload);

        if (result.success) {
            return result;
        }

        throw new Error("Axios failed");
    } catch (error) {
        console.log("⚠️ Switching to Puppeteer fallback...");

        const browserResult = await fetchCaseWithBrowser(payload);

        if (!browserResult.success) {
            throw new Error("Both Axios & Puppeteer failed");
        }

        return {
            ...browserResult,
            data: parseHtml(browserResult.html)
        };
    }
};

module.exports = { fetchCaseFromECourts };
