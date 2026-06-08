const mongoose = require('mongoose');

const appointmentStatusSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    
    companyName: { type: String, required: true },
    clientName: { type: String, required: true },
    dateTime: { type: Date, required: true },
    type: { type: String, default: 'New' },
    met: { type: Boolean, default: false },
    signed: { type: Boolean, default: false },
    follow: { type: Boolean, default: false },
    value: { type: Number, default: 0 },
    pending: { type: Boolean, default: false },
    pendingValue: { type: Number, default: 0 },
    remark: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    assignedBdm: { type: String, default: '' },
    tmeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tmeName: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('AppointmentStatus', appointmentStatusSchema);
