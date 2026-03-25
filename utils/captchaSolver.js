const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const solveCaptcha = async (imageBuffer) => {
    try {
        // 🔥 Preprocess image (VERY IMPORTANT)
        const processed = await sharp(imageBuffer)
            .grayscale()
            .threshold(150)
            .resize(200, 80)
            .toBuffer();

        const result = await Tesseract.recognize(processed, 'eng', {
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyz0123456789'
        });

        let text = result.data.text
            .replace(/[^a-z0-9]/gi, '')
            .toLowerCase()
            .trim();

        console.log("🧠 OCR Result:", text);

        return text;

    } catch (error) {
        console.error("OCR Error:", error.message);
        return null;
    }
};

module.exports = { solveCaptcha };