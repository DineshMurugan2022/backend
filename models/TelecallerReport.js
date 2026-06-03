const mongoose = require('mongoose');

const telecallerReportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userUsername: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    date: { type: Date, default: Date.now },
    
    // Call statistics
    totalCallsSpoke: { type: Number, default: 0 },       // How many calls they spoke
    totalCallsAttempted: { type: Number, default: 0 },   // Total calls attempted/dialed
    
    // Appointment details submitted by telecaller
    appointments: [{
        clientName: { type: String, default: '' },
        companyName: { type: String, default: '' },
        mobileNumber: { type: String, default: '' },
        appointmentDate: { type: Date },
        met: { type: Boolean, default: false },           // Met or Not Met
        notes: { type: String, default: '' },
        outcome: { type: String, default: '' },           // e.g. "Interested", "Follow-up needed", etc.
        followUpDate: { type: Date },
    }],
    
    // General notes for the day
    remarks: { type: String, default: '' },
    
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TelecallerReport', telecallerReportSchema);
