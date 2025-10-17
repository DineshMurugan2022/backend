const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Helper: require admin or team leader
function requireAdminOrLeader(req, res, next) {
  const role = req.user?.userGroup;
  if (role !== 'admin' && role !== 'team leader') {
    return res.status(403).json({ message: 'Only admin and team leaders are allowed' });
  }
  next();
}

// Helper function to get date without time (for attendance tracking)
function getDateWithoutTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// @route   GET /api/users
// @desc    Get all users (authenticated)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Optionally filter out admin from assignment lists on the frontend
    const users = await User.find()
      .select('-passwordHash -refreshToken -__v');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users/register
// @desc    Register a new user (admin/team leader only)
// @access  Private
router.post('/register', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { username, password, userGroup, phone } = req.body;
    if (!username || !password || !userGroup) {
      return res.status(400).json({ message: 'username, password and userGroup are required' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash, userGroup, phone, loginStatus: 'inactive' });
    await user.save();

    const safe = user.toObject();
    delete safe.passwordHash;
    delete safe.refreshToken;
    delete safe.__v;

    res.status(201).json(safe);
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (admin/team leader only)
// @access  Private
router.put('/:id', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const updates = { ...req.body };
    // Handle password update if provided
    if (updates.password) {
      updates.passwordHash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }

    // Do not allow changing protected fields directly
    delete updates.refreshToken;
    delete updates.__v;

    const updated = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash -refreshToken -__v');

    if (!updated) return res.status(404).json({ message: 'User not found' });

    res.json(updated);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (admin/team leader only, protect self-deletion)
// @access  Private
router.delete('/:id', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/me
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

// @route   GET /api/users/all
// @desc    Get all users (including admins) for attendance page
// @access  Private (admin only)
router.get('/all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.userGroup !== 'admin') {
      return res.status(403).json({ message: 'Only admins can access this endpoint' });
    }
    
    // Return all users for attendance page
    const users = await User.find().select('-passwordHash -refreshToken -__v');
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ message: 'Server error' });
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
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ No user found for logout:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user status to inactive and set logout time
    const logoutTime = new Date();
    user.loginStatus = 'inactive';
    user.logoutTime = logoutTime;
    
    // Update attendance record for today
    const logoutDate = getDateWithoutTime(logoutTime);
    const attendanceRecord = user.attendanceRecords.find(record => 
      getDateWithoutTime(record.date).getTime() === logoutDate.getTime()
    );
    
    if (attendanceRecord) {
      attendanceRecord.logoutTime = logoutTime;
      // Calculate total hours worked today
      if (attendanceRecord.loginTime) {
        const diffMs = logoutTime - attendanceRecord.loginTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        attendanceRecord.totalHours = parseFloat(diffHours.toFixed(2));
      }
    }
    
    await user.save();
    
    res.json({ message: 'Logout time updated' });
  } catch (error) {
    console.error('❌ Logout DB error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;