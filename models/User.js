const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }, // <== use passwordHash
  userGroup: { type: String, required: true },
  phone: String,
  loginStatus: { type: String, default: "active" },
  loginTime: { type: Date },
  logoutTime: { type: Date }
});

module.exports = mongoose.model("User", userSchema);
