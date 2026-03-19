const Case = require("../models/Case");
const sendReminder = require("../services/notificationService");

async function checkHearings(){

const today = new Date();

const cases = await Case.find({
 nextHearingDate: today
});

for(const c of cases){

 await sendReminder(
  c.deviceToken,
  `Hearing today for case ${c.caseNumber}`
 );

}

}

module.exports = checkHearings;