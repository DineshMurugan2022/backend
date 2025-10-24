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
      // Preserve the original login time, only update if it doesn't exist
      // This ensures the first login time is not changed
      if (!attendanceRecord.loginTime) {
        attendanceRecord.loginTime = today;
      }
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

// POST /api/attendance/manual - Manually mark attendance for a user
router.post('/manual', auth, requireAdminOrLeader, async (req, res) => {
  try {
    const { userId, date, status } = req.body;
    
    // Validate input
    if (!userId || !date || !status) {
      return res.status(400).json({ error: 'userId, date, and status are required' });
    }
    
    // Validate status
    if (!['present', 'absent'].includes(status)) {
      return res.status(400).json({ error: 'Status must be either "present" or "absent"' });
    }
    
    // Find user
    const user = await User.findById(userId);
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
    
    // Find existing attendance record for the date or create new one
    let attendanceRecord = user.attendanceRecords.find(record => 
      new Date(record.date).toDateString() === attendanceDate.toDateString()
    );
    
    if (!attendanceRecord) {
      // Create new attendance record
      attendanceRecord = {
        date: attendanceDate,
        loginTime: status === 'present' ? attendanceDate : null,
        logoutTime: status === 'present' ? new Date(attendanceDate.getTime() + 8 * 60 * 60 * 1000) : null, // 8 hours later
        totalHours: status === 'present' ? 8 : 0
      };
      user.attendanceRecords.push(attendanceRecord);
    } else {
      // Update existing record
      if (status === 'present') {
        // If marking as present and no login time, set default times
        if (!attendanceRecord.loginTime) {
          attendanceRecord.loginTime = attendanceDate;
          attendanceRecord.logoutTime = new Date(attendanceDate.getTime() + 8 * 60 * 60 * 1000); // 8 hours later
          attendanceRecord.totalHours = 8;
        }
      } else {
        // If marking as absent, clear times
        attendanceRecord.loginTime = null;
        attendanceRecord.logoutTime = null;
        attendanceRecord.totalHours = 0;
      }
    }
    
    await user.save();
    
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
    
    // Generate all dates in the month
    const datesInMonth = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      datesInMonth.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Create header row with dates
    const headerRow = ['Username'];
    datesInMonth.forEach(date => {
      headerRow.push(date.getDate().toString());
    });
    headerRow.push('Total Present', 'Total Logged In', 'Total Absent');
    
    worksheet.addRow(headerRow);
    
    // Process each user
    allUsers.forEach(user => {
      // Create a map of date to attendance record for this user
      const userAttendanceMap = {};
      user.attendanceRecords.forEach(record => {
        const recordDate = new Date(record.date);
        if (recordDate >= startDate && recordDate <= endDate) {
          const dateKey = recordDate.getDate();
          userAttendanceMap[dateKey] = record;
        }
      });
      
      // Create row for this user
      const userRow = [user.username];
      
      // Track counts for summary
      let presentCount = 0;
      let loggedInCount = 0;
      let absentCount = 0;
      
      // Add attendance status for each date
      datesInMonth.forEach(date => {
        const dateKey = date.getDate();
        const record = userAttendanceMap[dateKey];
        
        if (record) {
          // Determine status based on login/logout times
          if (record.loginTime) {
            if (record.logoutTime) {
              userRow.push('P'); // Present
              presentCount++;
            } else {
              userRow.push('LI'); // Logged In
              loggedInCount++;
            }
          } else {
            userRow.push('A'); // Absent
            absentCount++;
          }
        } else {
          userRow.push('A'); // Absent (no record)
          absentCount++;
        }
      });
      
      // Add summary counts
      userRow.push(presentCount, loggedInCount, absentCount);
      
      worksheet.addRow(userRow);
    });
    
    // Style the header row
    const headerRowObj = worksheet.getRow(1);
    headerRowObj.font = { bold: true };
    headerRowObj.alignment = { horizontal: 'center' };
    
    // Style the data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { horizontal: 'center' };
      }
    });
    
    // Auto-filter for the data
    worksheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(64 + headerRow.length)}1`
    };
    
    // Freeze the first row and first column
    worksheet.views = [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1,
      }
    ];
    
    // Set column widths
    worksheet.getColumn(1).width = 25; // Username column
    for (let i = 2; i <= datesInMonth.length + 1; i++) {
      worksheet.getColumn(i).width = 4; // Date columns
    }
    // Summary columns
    worksheet.getColumn(datesInMonth.length + 2).width = 12; // Total Present
    worksheet.getColumn(datesInMonth.length + 3).width = 12; // Total Logged In
    worksheet.getColumn(datesInMonth.length + 4).width = 12; // Total Absent
    
    // Add some styling to make it look better
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    
    worksheet.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    
    // Set response headers
    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_summary_${monthName}_${yearNum}.xlsx`);
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ error: 'Failed to generate attendance report' });
  }
});

module.exports = router;