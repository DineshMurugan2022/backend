const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { check } = require("express-validator");
const validate = require("../middleware/validate");

// SECURITY: Use environment variables for secrets
if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not defined in environment variables.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = "24h"; // Compromise for now
const REFRESH_TOKEN_EXPIRES_IN = "7d";

const attendanceService = require("../services/attendanceService");

// POST /api/auth/login
router.post("/login", [
  check("username", "Username is required").not().isEmpty(),
  check("password", "Password is required").not().isEmpty(),
  validate
], async (req, res) => {
  const { username, password } = req.body;
  // SECURITY: Do not log passwords
  console.log(`Login attempt for user: ${username}`);

  try {
    const user = await User.findOne({ username });

    // SECURITY: Use generic error message to prevent username enumeration
    const invalidCredsMsg = "Invalid username or password";

    if (!user || !user.passwordHash) {
      // Use a consistent delay or check to prevent timing attacks (advanced, but good practice to just fail generically)
      return res.status(401).json({ error: invalidCredsMsg });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      console.warn(`⚠️ Failed login attempt for user: ${username}`);
      return res.status(401).json({ error: invalidCredsMsg });
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

    // Use centralized attendance service
    await attendanceService.recordLogin(user, new Date());

    if (!user._id) {
      console.error('❌ FATAL: User object is missing _id after login:', user);
      return res.status(500).json({ error: 'Server error: User data is corrupt' });
    }

    // Set httpOnly cookie for access token (secure in production)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true, // Not accessible via JavaScript (XSS protection)
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'none' : 'strict', // 'none' required for cross-site cookies in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/' // Available for all routes
    };

    res.cookie('token', accessToken, cookieOptions);

    // Return user data and tokens
    res.json({
      message: "Login successful",
      token: accessToken, // Include access token for Authorization header
      refreshToken, // Still return refresh token for now
      user: {
        id: user._id,
        _id: user._id, // Ensure _id is always returned
        username: user.username,
        userGroup: user.userGroup,
        phone: user.phone,
        sipExtension: user.sipExtension,
        sipUsername: user.sipUsername,
        sipPassword: user.sipPassword,
        sipDomain: user.sipDomain,
        loginStatus: "active", // Updated status
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /api/auth/logout - Clear httpOnly cookie
router.post("/logout", (req, res) => {
  try {
    // Clear the token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      path: '/'
    });

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;