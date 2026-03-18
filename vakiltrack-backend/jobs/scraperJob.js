const cron = require("node-cron");
const scrapeCase = require("../scrapers/ecourtScraper");

cron.schedule("0 6 * * *",async()=>{

 console.log("Running daily scraper");

 await scrapeCase("123/2024");

});