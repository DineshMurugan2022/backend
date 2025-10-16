const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }, // <== use passwordHash
  userGroup: { type: String, required: true },
  phone: String,
  loginStatus: { type: String, default: "inactive" },
  loginTime: { type: Date, default: null },
  logoutTime: { type: Date, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  accuracy: { type: Number, default: null }, // Add accuracy field for location tracking
  lastUpdate: { type: Date, default: null }, // Add lastUpdate field for tracking BDM activity
  attendanceRecords: [{ 
    date: { type: Date, required: true },
    loginTime: { type: Date },
    logoutTime: { type: Date },
    totalHours: { type: Number, default: 0 }
  }], // Track detailed attendance records
  
  refreshToken: { type: String } // Store refresh token for session management
});

module.exports = mongoose.model("User", userSchema);