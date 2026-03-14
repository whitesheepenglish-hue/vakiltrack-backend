const puppeteer = require("puppeteer");

async function checkCaptchaHealth() {

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox","--disable-setuid-sandbox"]
});

const page = await browser.newPage();

await page.goto("https://services.ecourts.gov.in/");

const hasCaptcha = await page.evaluate(()=>{

return document.body.innerText.toLowerCase().includes("captcha");

});

await browser.close();

if(hasCaptcha){
console.log("CAPTCHA DETECTED");
return false;
}

console.log("NO CAPTCHA");
return true;

}

module.exports = checkCaptchaHealth;