const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  personName: { type: String, required: true },
  companyName: { type: String, required: true },
  callTime: { type: Date, default: Date.now },
  callStart: { type: Date },
  callEnd: { type: Date },
  duration: { type: Number, default: 0 }, // In seconds
  direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' }, // Added to track In vs Out calls
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Track who made the call
  status: { type: String, default: 'initiated' }, // initialized, ringing, in-progress, completed, failed
  sid: { type: String } // Twilio Call SID
});

module.exports = mongoose.model('CallLog', callLogSchema);