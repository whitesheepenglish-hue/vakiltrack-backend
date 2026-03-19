const mongoose = require("mongoose");

const CaseSchema = new mongoose.Schema({

 caseNumber:String,
 partyName:String,
 court:String,
 nextHearingDate:String,
 lastUpdated:Date

});

module.exports = mongoose.model("Case",CaseSchema);