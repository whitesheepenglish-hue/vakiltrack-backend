const cron = require("node-cron");
const db = require("../config/firebase");
const scrapeCase = require("../scrapers/ecourtScraper");

cron.schedule("0 7 * * *", async () => {

  const snapshot = await db.collection("cases").get();

  snapshot.forEach(async doc => {

    const caseNumber = doc.data().caseNumber;

    const data = await scrapeCase(caseNumber);

    await db.collection("cases").doc(caseNumber).update({
      nextHearing: data.nextHearing,
      updated: new Date()
    });

  });

  console.log("Cases updated");

});