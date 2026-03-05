const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const ExcelJS = require('exceljs');
const attendanceService = require('../services/attendanceService');

// Helper: require admin or team leader
function requireAdminOrLeader(req, res, next) {
  const role = req.user?.userGroup?.toLowerCase().trim();
  if (role !== 'admin' && role !== 'team leader' && role !== 'teamleader' && role !== 'hr') {
    return res.status(403).json({ message: 'Only admin, team leaders and HR are allowed' });
  }
  next();
}

// User login (mark present and set login time)
router.post('/login', async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Use service to record login (creates/updates Attendance doc)
    const updatedUserWithAttendance = await attendanceService.recordLogin(user);

    res.json({ success: true, attendance: updatedUserWithAttendance.currentAttendance });
  } catch (error) {
    console.error('Error updating attendance login:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update attendance' });
  }
});

// User logout (set logout time)
router.post('/logout', async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await attendanceService.recordLogout(user);

    // Fetch the updated attendance record to return
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendanceRecord = await Attendance.findOne({
      user: userId,
      date: { $gte: today }
    });

    res.json({ success: true, attendance: attendanceRecord });
  } catch (error) {
    console.error('Error updating attendance logout:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update attendance' });
  }
});

// POST /api/attendance/manual - Manually mark attendance for a user
router.post('/manual', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { userId, username, date, status } = req.body;

    // Validate input
    if ((!userId && !username) || !date || !status) {
      return res.status(400).json({ error: 'userId or username, date, and status are required' });
    }

    // Validate status
    if (!['present', 'absent', 'leave', 'permission', 'half-day'].includes(status)) {
      return res.status(400).json({ error: 'Status must be either "present", "absent", "leave", "permission", or "half-day"' });
    }

    // Find user by userId or username
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (username) {
      user = await User.findOne({ username: username });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse date safely
    // Parse date explicitly into UTC to avoid local timezone offset mismatch issues
    // The frontend and DB often handle this as YYYY-MM-DDT00:00:00.000Z
    const [yyyy, mm, dd] = date.split('-').map(Number);
    const attendanceDate = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);

    if (isNaN(attendanceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Define UTC start/end for query to match DB exactly
    const startOfDay = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);
    const endOfDay = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T23:59:59.999Z`);


    // Find existing attendance record or create new
    let attendanceRecord = await Attendance.findOne({
      user: user._id,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (!attendanceRecord) {
      attendanceRecord = new Attendance({
        user: user._id,
        date: attendanceDate,
        loginTime: null,
        logoutTime: null,
        totalHours: status === 'present' ? 8 : (status === 'leave' || status === 'permission' || status === 'half-day') ? 4 : 0,
        status: status
      });
    } else {
      // Update existing record
      attendanceRecord.status = status;
      if (status === 'present') {
        attendanceRecord.totalHours = 8;
        // Ensure not marked as absent overrides
      } else if (status === 'leave' || status === 'permission' || status === 'half-day') {
        attendanceRecord.totalHours = 4;
      } else {
        attendanceRecord.totalHours = 0;
      }
    }

    await attendanceRecord.save();

    // Emit socket event to notify clients of the update
    if (req.io) {
      req.io.emit('attendanceUpdated', {
        userId: user._id,
        username: user.username,
        date: attendanceDate.toISOString(),
        status: status
      });
    }

    res.json({
      success: true,
      message: `Attendance updated to ${status}`,
      attendance: attendanceRecord
    });
  } catch (error) {
    console.error('Error marking manual attendance:', error);
    res.status(500).json({ error: 'Failed to mark manual attendance' });
  }
});

// GET /api/attendance/range - Get attendance data for a specific date range
router.get('/range', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Get attendance records for this range
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('user', 'username name userGroup createdAt')
      .sort({ date: 1 })
      .lean();

    // Helper to format date as YYYY-MM-DD regardless of TZ
    const toYMD = (d) => {
      const date = new Date(d);
      // We want to extract the date as it was intended (at midday to avoid day jumps)
      // Actually, safest is to use the local components of the date object
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    };

    // Map records to formatted output
    const attendanceData = attendanceRecords.map(record => {
      const userDoc = record.user || {};
      const uId = userDoc._id || record.user; // fallback to raw ID if not populated

      return {
        userId: uId ? String(uId) : null,
        username: userDoc.username || 'Unknown',
        name: userDoc.name,
        userGroup: userDoc.userGroup,
        userCreatedAt: userDoc.createdAt,
        date: record.date,
        dateStr: toYMD(record.date),
        loginTime: record.loginTime,
        logoutTime: record.logoutTime,
        totalHours: record.totalHours,
        status: record.status
      };
    });

    res.json(attendanceData);
  } catch (error) {
    console.error('Error fetching attendance range:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// GET /api/attendance/:year/:month - Get attendance data for a specific month
router.get('/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Create date range for the month using local time
    const startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all users (lightweight query)
    // const allUsers = await User.find().select('username userGroup').lean(); 
    // ^ Not strictly needed for the response, handled by join

    // Get attendance records for this month with .lean() for performance
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('user', 'username userGroup')
      .lean();

    // Helper to format date as YYYY-M-D
    const toYMD = (d) => {
      const date = new Date(d);
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    };

    // Map records to formatted output
    const attendanceData = attendanceRecords.map(record => {
      const userDoc = record.user || {};
      const uId = userDoc._id || record.user;

      return {
        userId: uId ? String(uId) : null,
        username: userDoc.username || 'Unknown',
        userGroup: userDoc.userGroup,
        date: record.date,
        dateStr: toYMD(record.date),
        loginTime: record.loginTime,
        logoutTime: record.logoutTime,
        totalHours: record.totalHours,
        status: record.status
      };
    });

    res.json(attendanceData);
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// GET /api/attendance/:year/:month/download - Download attendance as Excel
router.get('/:year/:month/download', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get users excluding deleted
    const allUsers = await User.find({ deleted: { $ne: true } }).select('username name userGroup').lean();

    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    // Generate dates
    const datesInMonth = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      datesInMonth.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const headerRow = ['Full Name'];
    datesInMonth.forEach(date => {
      const isSunday = date.getDay() === 0;
      const dateStr = date.getDate().toString();
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      headerRow.push(isSunday ? `${dateStr}\n${dayStr}` : dateStr);
    });
    headerRow.push('Total Working Days', 'Total Present', 'Total Absent'); // Fixed headers
    worksheet.addRow(headerRow);

    // Process each user
    allUsers.forEach(user => {
      const userRecords = attendanceRecords.filter(r => r.user.toString() === user._id.toString());
      const userAttendanceMap = {};

      userRecords.forEach(r => {
        const d = new Date(r.date);
        userAttendanceMap[d.getDate()] = r;
      });

      const userRow = [user.name || user.username];
      let presentCount = 0;
      let absentCount = 0;
      let workingDaysCount = 0;

      datesInMonth.forEach(date => {
        const dateKey = date.getDate();
        const isSunday = date.getDay() === 0;

        // Check if future date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        if (isSunday) {
          userRow.push('Sun');
          return;
        }

        if (checkDate > today) {
          userRow.push('-');
          return;
        }

        workingDaysCount++;

        const record = userAttendanceMap[dateKey];

        let displayStatus = 'A'; // Default absent

        if (record) {
          if (record.status === 'absent') {
            displayStatus = 'A';
          } else if (['present', 'logged-in', 'permission'].includes(record.status)) {
            displayStatus = 'P';
          } else if (record.status === 'half-day') {
            displayStatus = 'H/D';
          } else if (record.status === 'leave') {
            displayStatus = 'L';
          } else if (record.loginTime) {
            // Fallback if status not set but logged in
            displayStatus = 'P';
          }
        }

        // Increment counters
        if (displayStatus === 'P' || displayStatus === 'L') presentCount++;
        else if (displayStatus === 'H/D') {
          presentCount += 0.5;
          absentCount += 0.5;
        }
        else absentCount++;

        userRow.push(displayStatus);
      });

      userRow.push(
        workingDaysCount,
        Number.isInteger(presentCount) ? presentCount : Math.floor(presentCount) === 0 ? "1/2" : `${Math.floor(presentCount)} 1/2`,
        Number.isInteger(absentCount) ? absentCount : Math.floor(absentCount) === 0 ? "1/2" : `${Math.floor(absentCount)} 1/2`
      );
      worksheet.addRow(userRow);
    });

    // Formatting
    const headerRowObj = worksheet.getRow(1);
    headerRowObj.font = { bold: true };
    headerRowObj.alignment = { horizontal: 'center' };

    // Auto-filter
    worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headerRow.length)}1` };

    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_summary_${monthName}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ error: 'Failed to generate attendance report' });
  }
});

// POST /api/attendance/bulk-manual - Manually mark attendance for multiple users
router.post('/bulk-manual', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { userIds, date, status } = req.body;

    if (!userIds || !userIds.length || !date || !status) {
      return res.status(400).json({ error: 'userIds, date, and status are required' });
    }

    if (!['present', 'absent', 'leave', 'permission', 'half-day'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [yyyy, mm, dd] = date.split('-').map(Number);
    const startOfDay = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);
    const endOfDay = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T23:59:59.999Z`);
    const attendanceDate = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);

    const totalHours = status === 'present' ? 8 : (status === 'leave' || status === 'permission' || status === 'half-day') ? 4 : 0;

    const bulkOps = userIds.map(userId => ({
      updateOne: {
        filter: { user: userId, date: { $gte: startOfDay, $lte: endOfDay } },
        update: {
          $set: {
            user: userId,
            date: attendanceDate,
            status: status,
            totalHours: totalHours
          }
        },
        upsert: true
      }
    }));

    await Attendance.bulkWrite(bulkOps);

    if (req.io) {
      req.io.emit('attendanceUpdated', { bulk: true, userIds, date: attendanceDate.toISOString(), status });
    }

    res.json({ success: true, message: `Attendance updated for ${userIds.length} users` });
  } catch (error) {
    console.error('Error in bulk attendance:', error);
    res.status(500).json({ error: 'Failed to update bulk attendance' });
  }
});

module.exports = router;