const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Reset all users to inactive (for testing)
router.post('/reset-status', async (req, res) => {
  try {
    await User.updateMany({}, { loginStatus: "inactive", loginTime: null, logoutTime: null });
    res.json({ message: 'All users reset to inactive' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout endpoint to update logout time and status
router.post('/logout', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await User.findByIdAndUpdate(userId, { loginStatus: 'inactive', logoutTime: new Date() });
    res.json({ message: 'Logout time updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
