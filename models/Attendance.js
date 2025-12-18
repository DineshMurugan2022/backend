const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    date: {
        type: Date,
        required: true,
        index: true // Add index for faster queries by date
    },
    loginTime: {
        type: Date
    },
    logoutTime: {
        type: Date
    },
    totalHours: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'leave', 'permission', 'half-day'],
        default: 'absent'
    },
    locationLogs: [{ // Optional: Track location pings during the day if needed here, or keep separate
        timestamp: Date,
        lat: Number,
        lng: Number,
        address: String
    }],
    notes: {
        type: String
    }
}, { timestamps: true });

// Compound index to ensure one attendance record per user per day is unique (if that's the rule)
// attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
