const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your_fallback_secret";
const ACCESS_TOKEN_EXPIRES_IN = "365d"; // Extended access token expiration
const REFRESH_TOKEN_EXPIRES_IN = "365d"; // Extended refresh token expiration

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
      console.log("Invalid credentials");
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    console.log("Password match:", isMatch);

    if (!isMatch) {
      console.log("Incorrect password for user:", username);
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

    // Update user status to active in database
    await User.findByIdAndUpdate(user._id, { loginStatus: "active", loginTime: new Date(), logoutTime: null });

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
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

// POST /api/auth/refresh-token
router.post("/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    // Find user with this refresh token
    const user = await User.findOne({ _id: decoded.id, refreshToken });
    if (!user) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    // Issue new access token
    const accessToken = jwt.sign(
      {
        id: user._id,
        username: user.username,
        userGroup: user.userGroup,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );
    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

module.exports = router;
