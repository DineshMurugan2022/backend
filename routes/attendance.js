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
  if (role !== 'admin' && role !== 'team leader' && role !== 'teamleader') {
    return res.status(403).json({ message: 'Only admin and team leaders are allowed' });
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
    if (!['present', 'absent', 'leave', 'permission'].includes(status)) {
      return res.status(400).json({ error: 'Status must be either "present", "absent", "leave", or "permission"' });
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

    // Parse date
    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Set to start of day
    attendanceDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find existing attendance record or create new
    let attendanceRecord = await Attendance.findOne({
      user: user._id,
      date: { $gte: attendanceDate, $lte: endOfDay }
    });

    if (!attendanceRecord) {
      attendanceRecord = new Attendance({
        user: user._id,
        date: attendanceDate,
        loginTime: null,
        logoutTime: null,
        totalHours: status === 'present' ? 8 : (status === 'leave' || status === 'permission') ? 4 : 0,
        status: status
      });
    } else {
      // Update existing record
      attendanceRecord.status = status;
      if (status === 'present') {
        attendanceRecord.totalHours = 8;
      } else if (status === 'leave' || status === 'permission') {
        attendanceRecord.totalHours = 4;
      } else {
        attendanceRecord.totalHours = 0;
      }
      // Preserve login/logout times if they exist (or clear them if "absent" maybe? kept for now)
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
      message: `Attendance marked as ${status} for ${user.username} on ${attendanceDate.toDateString()}`,
      attendance: attendanceRecord
    });
  } catch (error) {
    console.error('Error marking manual attendance:', error);
    res.status(500).json({ error: 'Failed to mark manual attendance' });
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

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all users
    const allUsers = await User.find().select('username userGroup');

    // Get attendance records for this month
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('user', 'username userGroup');

    // Map records to formatted output
    const attendanceData = attendanceRecords.map(record => ({
      userId: record.user._id, // vital for keying
      username: record.user?.username || 'Unknown',
      userGroup: record.user?.userGroup,
      date: record.date,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      totalHours: record.totalHours,
      status: record.status
    }));

    res.json(attendanceData);
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// GET /api/users/attendance/:year/:month/download - Download attendance as Excel
// Note: Route path should match server.js usage. server.js mounts this router at /api/attendance
// So this is /api/attendance/:year/:month/download
router.get('/:year/:month/download', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get users excluding deleted
    const allUsers = await User.find({ deleted: { $ne: true } }).select('username name userGroup');

    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    // Generate dates
    const datesInMonth = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      datesInMonth.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Header logic similar to before...
    const headerRow = ['Full Name'];
    datesInMonth.forEach(date => {
      const isSunday = date.getDay() === 0;
      const dateStr = date.getDate().toString();
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      headerRow.push(isSunday ? `${dateStr}\n${dayStr}` : dateStr);
    });
    headerRow.push('Total Working Days', 'Total Present', 'Total Absent');
    worksheet.addRow(headerRow);

    // Process each user
    allUsers.forEach(user => {
      // Filter records for this user
      const userRecords = attendanceRecords.filter(r => r.user.toString() === user._id.toString());

      // Map date -> record
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        if (isSunday) {
          userRow.push('Sunday');
          return;
        }
        if (checkDate > today) {
          userRow.push('-');
          return;
        }

        workingDaysCount++;
        const record = userAttendanceMap[dateKey];
        if (record) {
          if (record.status === 'absent') {
            userRow.push('A');
            absentCount++;
            return;
          }
          let status = record.status;
          if (!status && record.loginTime) status = 'present';
          if (!status) status = 'absent';

          if (['present', 'logged-in', 'permission'].includes(status)) {
            userRow.push('P');
            presentCount++;
          } else if (status === 'leave') {
            userRow.push('L');
            presentCount++; // As per previous logic
          } else {
            userRow.push('A');
            absentCount++;
          }
        } else {
          userRow.push('A');
          absentCount++;
        }
      });
      userRow.push(workingDaysCount, presentCount, absentCount);
      worksheet.addRow(userRow);
    });

    // Add a blank row
    worksheet.addRow([]);

    // Add working days calculation row
    const calcRow = ['Working Days Calculation'];
    let totalWorkingDays = 0;
    datesInMonth.forEach(date => {
      const isSunday = date.getDay() === 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentDate = new Date(date);
      currentDate.setHours(0, 0, 0, 0);
      const isUpcoming = currentDate > today;

      if (isSunday) {
        calcRow.push('Sun');
      } else if (isUpcoming) {
        calcRow.push('-');
      } else {
        calcRow.push('WD');
        totalWorkingDays++;
      }
    });
    calcRow.push(totalWorkingDays, '-', '-');
    const calcRowObj = worksheet.addRow(calcRow); // ... (styling same as before)

    // ... (rest of styling logic omitted for brevity but should be included)
    // Style the calculation row
    calcRowObj.font = { bold: true, color: { argb: 'FF000000' } };
    calcRowObj.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' } // Light gray background
    };
    calcRowObj.alignment = { horizontal: 'center', vertical: 'middle' };

    // Header styling
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

module.exports = router;