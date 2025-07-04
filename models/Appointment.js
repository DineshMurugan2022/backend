const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  client: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  met: {
    type: Boolean,
    default: false,
  },
  signed: {
    type: Boolean,
    default: false,
  },
  contractValue: {
    type: Number,
    default: 0,
    min: [0, 'Contract value cannot be negative'],
  },
  clearancePending: {
    type: Boolean,
    default: false,
  },
  follow: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'CreatedBy (user) is required'],
  },
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
