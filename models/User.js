const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, default: "" }, // Add name field
  passwordHash: { type: String, required: true }, // <== use passwordHash
  userGroup: { type: String, required: true },
  designation: { type: String, default: "" }, // Add designation field
  phone: String,
  loginStatus: { type: String, default: "inactive" },
  loginTime: { type: Date, default: null },
  logoutTime: { type: Date, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  accuracy: { type: Number, default: null }, // Add accuracy field for location tracking
  lastUpdate: { type: Date, default: null }, // Add lastUpdate field for tracking BDM activity
  deleted: { type: Boolean, default: false }, // Add deleted flag for soft delete
  // attendanceRecords removed - using separate Attendance model

  // SIP Credentials
  sipExtension: { type: String, default: "" },
  sipUsername: { type: String, default: "" },
  sipPassword: { type: String, default: "" },
  sipDomain: { type: String, default: "" },

  refreshToken: { type: String } // Store refresh token for session management
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);