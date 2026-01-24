const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  client: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
  },
  companyName: {
    type: String,
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
  clearanceAmount: {
    type: Number,
    default: 0,
    min: [0, 'Clearance amount cannot be negative'],
  },
  follow: {
    type: Boolean,
    default: false,
  },
  followDate: {
    type: Date,
  },
  renewal: {
    type: String,
    enum: ['renewal', 'fresh'],
    default: 'fresh'
  },
  assignedBDM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'CreatedBy (user) is required'],
  },
  remark: {
    type: String,
    trim: true,
    default: ''
  },
  // Soft delete field - tracks which users have deleted this appointment
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;