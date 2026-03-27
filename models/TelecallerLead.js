const mongoose = require('mongoose');

const telecallerLeadSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    companyName: { type: String, trim: true },
    clientName: { type: String, trim: true },
    designation: { type: String, trim: true },
    state: { type: String, trim: true },
    industryType: { type: String, trim: true },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Assigned user is required']
    },
    status: {
        type: String,
        enum: ['uncalled', 'picked', 'called'],
        default: 'uncalled'
    },
    dateAssigned: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Optimizing for fast searching of uncalled leads per user
telecallerLeadSchema.index({ assignedTo: 1, status: 1 });
telecallerLeadSchema.index({ phoneNumber: 1 });

module.exports = mongoose.model('TelecallerLead', telecallerLeadSchema);
