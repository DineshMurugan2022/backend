const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  loginTime: { type: Date },
  logoutTime: { type: Date },
  status: { type: String, enum: ['present', 'absent'], default: 'absent' }
});

module.exports = mongoose.model('Attendance', attendanceSchema);