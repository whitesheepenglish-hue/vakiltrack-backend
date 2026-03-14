const db = require("../config/firebase");
const scrapeCase = require("../scrapers/ecourtScraper");

exports.trackCase = async (req, res) => {

  try {

    const { caseNumber } = req.body;

    const caseData = await scrapeCase(caseNumber);

    await db.collection("cases").doc(caseNumber).set({
      caseNumber,
      petitioner: caseData.petitioner,
      respondent: caseData.respondent,
      nextHearing: caseData.nextHearing,
      court: caseData.court,
      updated: new Date()
    });

    res.json({ success: true });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};