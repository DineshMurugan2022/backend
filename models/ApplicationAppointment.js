const mongoose = require('mongoose');

const ApplicationAppointmentSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    customerName: { type: String, required: true },
    number: { type: String, required: true },
    location: { type: String, required: true },
    dateTime: { type: Date, required: true },
    met: { type: Boolean, default: false },
    signed: { type: Boolean, default: false },
    follow: { type: Boolean, default: false },
    feedback: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ApplicationAppointment', ApplicationAppointmentSchema);
