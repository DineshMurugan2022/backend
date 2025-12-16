const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true }, // Store name for easier display
    userUsername: { type: String }, // Store username for explicit identification
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who actually submitted it
    createdByName: { type: String }, // Name of submitter
    date: { type: Date, default: Date.now },
    items: [{
        project: { type: String, default: '' },
        client: { type: String, default: '' },
        task: { type: String, default: '' },
        description: { type: String, default: '' },
        status: { type: String, enum: ['Completed', 'In Progress', 'Pending'], default: 'Completed' }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
