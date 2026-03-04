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
  mobileNumber: {
    type: String,
    trim: true,
  },
  alternateNumber: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
  },
  designation: {
    type: String,
    trim: true,
  },
  landmark: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  pinNumber: {
    type: String,
    trim: true,
  },
  notes: {
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

// Performance Indexes
appointmentSchema.index({ date: -1 });
appointmentSchema.index({ assignedBDM: 1 });
appointmentSchema.index({ createdBy: 1 });
appointmentSchema.index({ signed: 1 });
appointmentSchema.index({ companyName: 1 });
appointmentSchema.index({ mobileNumber: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;