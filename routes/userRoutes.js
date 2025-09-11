const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');

// @route   GET api/users/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-passwordHash -refreshToken -__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
