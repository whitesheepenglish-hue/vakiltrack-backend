const admin = require("../config/firebase");

async function sendReminder(token,message){

const payload = {

 notification:{
  title:"Court Hearing Reminder",
  body:message
 }

};

await admin.messaging().sendToDevice(token,payload);

}

module.exports = sendReminder;