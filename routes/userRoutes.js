const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const attendanceService = require('../services/attendanceService');

// Helper: require admin or team leader
function requireAdminOrLeader(req, res, next) {
  const role = req.user?.userGroup?.toLowerCase().trim();
  const allowed = ['admin', 'team leader', 'teamleader', 'hr', 'telecaller tl', 'telecaller-tl'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ message: 'Only admin, team leaders and HR are allowed' });
  }
  next();
}

// Helper function to get date without time (for attendance tracking)
function getDateWithoutTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const Appointment = require('../models/Appointment');

// @route   GET /api/users
// @desc    Get all users (authenticated)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Optionally filter out admin from assignment lists on the frontend
    // Also filter out deleted users
    const users = await User.find({ deleted: { $ne: true } })
      .select('-passwordHash -refreshToken -__v')
      .lean(); // Use lean() to get plain JS objects so we can add properties

    // Get start and end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Get appointment stats for all users (Met/Not Met) - FOR TODAY ONLY
    // We'll aggregate counts based on assignedBDM or createdBy
    const appointmentStats = await Appointment.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: {
            $ifNull: ["$assignedBDM", "$createdBy"]
          },
          met: { $sum: { $cond: [{ $eq: ["$met", true] }, 1, 0] } },
          notMet: { $sum: { $cond: [{ $eq: ["$met", false] }, 1, 0] } }
        }
      }
    ]);

    // Debug logging
    console.log(`[DEBUG] Date range: ${startOfDay} to ${endOfDay}`);
    console.log(`[DEBUG] Appointment stats found: ${appointmentStats.length}`, appointmentStats);

    // Create a map for quick lookup
    const statsMap = {};
    appointmentStats.forEach(stat => {
      if (stat._id) {
        statsMap[stat._id.toString()] = { met: stat.met, notMet: stat.notMet };
      }
    });

    // Merge stats into user objects
    const usersWithStats = users.map(user => {
      const stats = statsMap[user._id.toString()] || { met: 0, notMet: 0 };
      return {
        ...user,
        met: stats.met,
        notMet: stats.notMet
      };
    });

    res.json(usersWithStats);
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
    const { username, name, password, designation, userGroup, phone, sipExtension, sipUsername, sipPassword, sipDomain } = req.body;
    if (!username || !password || !userGroup) {
      return res.status(400).json({ message: 'username, password and userGroup are required' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      name: name || '', // Add name field
      passwordHash,
      designation: designation || '', // Add designation field
      userGroup,
      phone,
      sipExtension: sipExtension || '',
      sipUsername: sipUsername || '',
      sipPassword: sipPassword || '',
      sipDomain: sipDomain || '',
      loginStatus: 'inactive'
    });
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

    // Instead of deleting the user, we'll soft delete by:
    // 1. Clearing sensitive information (username, password)
    // 2. Marking the user as deleted
    // 3. Keeping all other data intact (appointments, leads, etc.)
    const updated = await User.findByIdAndUpdate(
      id,
      {
        username: `[deleted_${Date.now()}_${id}]`,
        passwordHash: '',
        phone: '',
        loginStatus: 'inactive',
        loginTime: null,
        logoutTime: null,
        lat: null,
        lng: null,
        accuracy: null,
        lastUpdate: null,
        refreshToken: null,
        deleted: true // Mark as deleted
      },
      { new: true }
    ).select('-passwordHash -refreshToken -__v');

    if (!updated) return res.status(404).json({ message: 'User not found' });

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
    // Check if user is admin, team leader, or telecaller tl (Normalized)
    const userRole = req.user.userGroup?.toLowerCase().trim();
    const allowed = ['admin', 'team leader', 'teamleader', 'hr', 'telecaller tl', 'telecaller-tl'];
    if (!allowed.includes(userRole)) {
      return res.status(403).json({ message: 'Only admins, team leaders and HR can access this endpoint' });
    }

    // Return all users for attendance page, excluding deleted users
    const users = await User.find({ deleted: { $ne: true } }).select('-passwordHash -refreshToken -__v');

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
    await attendanceService.recordLogout(user, logoutTime);

    await user.save();

    res.json({ message: 'Logout time updated' });
  } catch (error) {
    console.error('❌ Logout DB error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/users/:id/location-history
// @desc    Get location history for a user (authenticated)
// @access  Private
router.get('/:id/location-history', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query; // Expect YYYY-MM-DD

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const LocationLog = require('../models/LocationLog');

    let startDate, endDate;
    if (date) {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Default to today
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    const logs = await LocationLog.find({
      userId: id,
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: 1 }).select('lat lng timestamp speed accuracy');

    res.json(logs);
  } catch (err) {
    console.error('Error fetching location history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;