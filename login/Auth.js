const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your_fallback_secret";
const ACCESS_TOKEN_EXPIRES_IN = "365d"; // Extended access token expiration
const REFRESH_TOKEN_EXPIRES_IN = "365d"; // Extended refresh token expiration

// Helper function to get date without time (for attendance tracking)
function getDateWithoutTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt:", username, password);

  if (!username || !password) {
    console.log("Missing username or password");
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const user = await User.findOne({ username });
    console.log("User found:", user);

    if (!user || !user.passwordHash) {
      console.warn(`⚠️ Login attempt for non-existent user: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    console.log("Password match:", isMatch);

    if (!isMatch) {
      console.warn(`⚠️ Incorrect password for user: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Issue access token (short-lived)
    const accessToken = jwt.sign(
      {
        id: user._id,
        username: user.username,
        userGroup: user.userGroup,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );

    // Issue refresh token (long-lived)
    const refreshToken = jwt.sign(
      {
        id: user._id,
        username: user.username,
        userGroup: user.userGroup,
      },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Store refresh token in DB
    user.refreshToken = refreshToken;
    await user.save();

    console.log("Login successful:", username);

    // Update user status to active in database and add attendance record
    const loginTime = new Date();
    const loginDate = getDateWithoutTime(loginTime);
    
    // Find existing attendance record for today or create new one
    let attendanceRecord = user.attendanceRecords.find(record => 
      getDateWithoutTime(record.date).getTime() === loginDate.getTime()
    );
    
    if (!attendanceRecord) {
      // Create new attendance record for today
      attendanceRecord = {
        date: loginDate,
        loginTime: loginTime,
        logoutTime: null,
        totalHours: 0
      };
      user.attendanceRecords.push(attendanceRecord);
    } else {
      // Preserve the original login time, only update if it doesn't exist
      // This ensures the first login time is not changed
      if (!attendanceRecord.loginTime) {
        attendanceRecord.loginTime = loginTime;
      }
      attendanceRecord.logoutTime = null;
      attendanceRecord.totalHours = 0;
    }
    
    user.loginStatus = "active";
    user.loginTime = loginTime;
    user.logoutTime = null;
    await user.save();

    if (!user._id) {
      console.error('❌ FATAL: User object is missing _id after login:', user);
      return res.status(500).json({ error: 'Server error: User data is corrupt' });
    }

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        _id: user._id, // Ensure _id is always returned
        username: user.username,
        userGroup: user.userGroup,
        phone: user.phone,
        loginStatus: "active", // Updated status
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;