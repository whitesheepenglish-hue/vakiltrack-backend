const scrapeCase = require("../scrapers/ecourtScraper");

exports.getCase = async (req, res) => {

  try {

    const caseNumber = req.query.number;

    if (!caseNumber) {
      return res.status(400).json({
        error: "Case number required"
      });
    }

    const data = await scrapeCase(caseNumber);

    res.json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to fetch case data"
    });

  }

};