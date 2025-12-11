const mongoose = require('mongoose');

const locationLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    accuracy: Number,
    speed: Number, // Speed in m/s
    heading: Number,
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index for efficient querying by user and time
locationLogSchema.index({ userId: 1, timestamp: 1 });

module.exports = mongoose.model('LocationLog', locationLogSchema);
