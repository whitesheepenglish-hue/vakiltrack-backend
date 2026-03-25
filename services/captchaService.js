const axios = require('axios');

const getCaptcha = async () => {
    const response = await axios.get(
        "https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/captcha",
        { responseType: "arraybuffer" }
    );

    const cookies = response.headers['set-cookie'];
    const sessionCookie = cookies.find(c => c.includes("PHPSESSID"));
    const session_id = sessionCookie.split(";")[0].split("=")[1];

    return {
        session_id,
        image: Buffer.from(response.data)
    };
};

module.exports = { getCaptcha };