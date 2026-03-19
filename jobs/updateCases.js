const cron = require("node-cron");
const Case = require("../models/Case");
const scrapeCase = require("../scrapers/ecourtScraper");

cron.schedule("0 2 * * *", async () => {

console.log("Running nightly case update...");

const cases = await Case.find();

for (const c of cases) {

 const data = await scrapeCase(c.caseNumber);

 c.nextHearingDate = data.nextHearing;

 await c.save();

}

console.log("All cases updated");

});
