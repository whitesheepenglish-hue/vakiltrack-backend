const Case = require("../models/Case");
const scrapeCase = require("../scrapers/ecourtScraper");

exports.scrapeAndSave = async (req,res)=>{

 const caseno = req.params.caseno;

 const data = await scrapeCase(caseno);

 const newCase = new Case({

  caseNumber:data.caseNumber,
  partyName:data.petitioner+" vs "+data.respondent,
  court:data.court,
  nextHearingDate:data.nextHearing,
  lastUpdated:new Date()

 });

 await newCase.save();

 res.json({
  message:"Case saved",
  case:data
 });

};