const axios = require('axios');
const { getCaptcha } = require('./captchaService');
const { solveCaptcha } = require('../utils/captchaSolver');

const fetchCaseFromECourts = async (payload) => {
    for (let i = 0; i < 5; i++) {
        console.log(`🔁 Attempt ${i + 1}`);

        const captchaData = await getCaptcha();
        const captchaText = await solveCaptcha(captchaData.image);

        if (!captchaText || captchaText.length !== 6) {
            console.log("❌ Bad OCR, retrying...");
            continue;
        }

        try {
            const response = await axios.post(
                "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index",
                new URLSearchParams({
                    dist_code: payload.dist_code,
                    court_code: payload.court_code,
                    case_type: payload.case_type,
                    case_no: payload.case_number,
                    case_year: payload.year,
                    captcha: captchaText
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Cookie": `PHPSESSID=${captchaData.session_id}`
                    },
                    timeout: 10000
                }
            );

            const html = response.data;

            if (html.includes("Invalid Captcha")) {
                console.log("❌ Captcha failed");
                continue;
            }

            if (!html || html.length < 500) {
                console.log("❌ Empty response");
                continue;
            }

            return {
                success: true,
                html
            };
        } catch (err) {
            console.log("⚠️ Request error:", err.message);
        }
    }

    return {
        success: false,
        message: "All captcha attempts failed"
    };
};

module.exports = { fetchCaseFromECourts };
