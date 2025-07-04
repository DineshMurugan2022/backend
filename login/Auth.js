const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your_fallback_secret";

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

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        userGroup: user.userGroup,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("Login successful:", username);

    // Update user status to active in database
    await User.findByIdAndUpdate(user._id, { loginStatus: "active", loginTime: new Date(), logoutTime: null });

    res.json({
      message: "Login successful",
      token,
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

module.exports = router;
