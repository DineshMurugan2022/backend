


const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const ExcelJS = require('exceljs');

// Helper: require admin or team leader
function requireAdminOrLeader(req, res, next) {
  const role = req.user?.userGroup;
  if (role !== 'admin' && role !== 'team leader') {
    return res.status(403).json({ message: 'Only admin and team leaders are allowed' });
  }
  next();
}

// User login (mark present and set login time)
router.post('/login', async (req, res) => {
  const { userId } = req.body;
  
  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Update login time in user's attendance records
    const today = new Date();
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Find existing attendance record for today or create new one
    let attendanceRecord = user.attendanceRecords.find(record => 
      new Date(record.date).toDateString() === dateOnly.toDateString()
    );
    
    if (!attendanceRecord) {
      // Create new attendance record for today
      attendanceRecord = {
        date: dateOnly,
        loginTime: today,
        logoutTime: null,
        totalHours: 0
      };
      user.attendanceRecords.push(attendanceRecord);
    } else {
      // Update existing record
      attendanceRecord.loginTime = today;
      attendanceRecord.logoutTime = null;
      attendanceRecord.totalHours = 0;
    }
    
    await user.save();
    
    res.json({ success: true, attendance: attendanceRecord });
  } catch (error) {
    console.error('Error updating attendance login:', error);
    res.status(500).json({ success: false, message: 'Failed to update attendance' });
  }
});

// User logout (set logout time)
router.post('/logout', async (req, res) => {
  const { userId } = req.body;
  
  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Update logout time in user's attendance records
    const today = new Date();
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Find existing attendance record for today
    let attendanceRecord = user.attendanceRecords.find(record => 
      new Date(record.date).toDateString() === dateOnly.toDateString()
    );
    
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    
    // Update logout time and calculate total hours
    attendanceRecord.logoutTime = today;
    if (attendanceRecord.loginTime) {
      const diffMs = today - attendanceRecord.loginTime;
      const diffHours = diffMs / (1000 * 60 * 60);
      attendanceRecord.totalHours = parseFloat(diffHours.toFixed(2));
    }
    
    await user.save();
    
    res.json({ success: true, attendance: attendanceRecord });
  } catch (error) {
    console.error('Error updating attendance logout:', error);
    res.status(500).json({ success: false, message: 'Failed to update attendance' });
  }
});

// GET /api/attendance/:year/:month - Get attendance data for a specific month
router.get('/:year/:month', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    
    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    
    // Get all users
    const allUsers = await User.find().select('username userGroup attendanceRecords');
    
    // Format the data
    const attendanceData = [];
    allUsers.forEach(user => {
      user.attendanceRecords.forEach(record => {
        const recordDate = new Date(record.date);
        if (recordDate >= startDate && recordDate <= endDate) {
          attendanceData.push({
            username: user.username,
            userGroup: user.userGroup,
            date: record.date,
            loginTime: record.loginTime,
            logoutTime: record.logoutTime
          });
        }
      });
    });
    
    // Sort by date and username
    attendanceData.sort((a, b) => {
      if (a.date.getTime() !== b.date.getTime()) {
        return a.date.getTime() - b.date.getTime();
      }
      return a.username.localeCompare(b.username);
    });
    
    res.json(attendanceData);
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// GET /api/users/attendance/:year/:month/download - Download attendance as Excel
router.get('/:year/:month/download', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    
    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    
    // Get all users (not just those with attendance records)
    const allUsers = await User.find().select('username userGroup attendanceRecords');
    
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');
    
    // Define columns (added Present/Absent column)
    worksheet.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'User Group', key: 'userGroup', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Login Time', key: 'loginTime', width: 25 },
      { header: 'Logout Time', key: 'logoutTime', width: 25 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    
    // Generate all dates in the month
    const datesInMonth = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      datesInMonth.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Add data to worksheet - include all users for all dates
    allUsers.forEach(user => {
      // If user has attendance records in this month, use them
      const userAttendanceRecords = user.attendanceRecords.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
      
      // If user has attendance records, add them
      if (userAttendanceRecords.length > 0) {
        userAttendanceRecords.forEach(record => {
          // Determine status based on login/logout times
          let status = 'Absent';
          if (record.loginTime) {
            status = record.logoutTime ? 'Present' : 'Logged In';
          }
          
          worksheet.addRow({
            username: user.username,
            userGroup: user.userGroup,
            date: record.date ? record.date.toISOString().split('T')[0] : '',
            loginTime: record.loginTime ? record.loginTime.toLocaleString() : '',
            logoutTime: record.logoutTime ? record.logoutTime.toLocaleString() : '',
            status: status
          });
        });
      } else {
        // If user has no attendance records, add placeholder rows for each date
        datesInMonth.forEach(date => {
          worksheet.addRow({
            username: user.username,
            userGroup: user.userGroup,
            date: date.toISOString().split('T')[0],
            loginTime: '',
            logoutTime: '',
            status: 'Absent'
          });
        });
      }
    });
    
    // Sort worksheet by username and date
    worksheet.model.rows.sort((a, b) => {
      const aUsername = a.cells[1].value || '';
      const bUsername = b.cells[1].value || '';
      const aDate = new Date(a.cells[3].value || '').getTime();
      const bDate = new Date(b.cells[3].value || '').getTime();
      
      if (aUsername !== bUsername) {
        return aUsername.localeCompare(bUsername);
      }
      return aDate - bDate;
    });
    
    // Set response headers
    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${monthName}_${yearNum}.xlsx`);
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ error: 'Failed to generate attendance report' });
  }
});

module.exports = router;