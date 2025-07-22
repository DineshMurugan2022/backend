const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');

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
  console.log('Received logout for userId:', userId, 'body:', req.body);
  if (!userId || userId === 'undefined') return res.status(400).json({ error: 'Valid userId required' });
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.error('❌ Invalid ObjectId for logout:', userId);
    return res.status(400).json({ error: 'Invalid userId format' });
  }
  try {
    const updated = await User.findByIdAndUpdate(userId, { loginStatus: 'inactive', logoutTime: new Date() });
    if (!updated) {
      console.error('❌ No user found for logout:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'Logout time updated' });
  } catch (error) {
    console.error('❌ Logout DB error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
