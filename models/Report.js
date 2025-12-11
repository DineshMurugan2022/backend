const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true }, // Store name for easier display
    date: { type: Date, default: Date.now },
    startTime: { type: String, required: true }, // e.g., "09:30 AM"
    endTime: { type: String, required: true },   // e.g., "06:30 PM"
    projects: { type: String, default: '' },     // Project names / Start Report content
    taskDescription: { type: String, required: true },
    status: { type: String, enum: ['Completed', 'In Progress', 'Pending'], default: 'Completed' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
