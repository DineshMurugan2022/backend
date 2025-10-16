const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET api/users
// @desc    Get all non-admin users
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Only return non-admin users for task assignment
    const users = await User.find({ userGroup: { $ne: 'admin' } })
      .select('-password -refreshToken -__v');
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/all
// @desc    Get all users (including admins) for attendance page
// @access  Private (admin only)
router.get('/all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.userGroup !== 'admin') {
      return res.status(403).json({ message: 'Only admins can access this endpoint' });
    }
    
    // Return all users for attendance page
    const users = await User.find().select('-password -refreshToken -__v');
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshToken -__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;