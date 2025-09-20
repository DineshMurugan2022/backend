const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  personName: { type: String, required: true },
  companyName: { type: String, required: true },
  callTime: { type: Date, default: Date.now },
  duration: { type: Number, default: 0 }, // In seconds
});
module.exports = mongoose.model('CallLog', callLogSchema);