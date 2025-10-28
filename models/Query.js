const mongoose = require('mongoose');

const querySchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  companyName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  query: { type: String, required: true },
  assignedTo: { type: String, default: '' }, // tech team username
  daysToComplete: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Query', querySchema);
