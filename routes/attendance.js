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
    
    // Find existing attendance record for the date or create new one
    let attendanceRecord = user.attendanceRecords.find(record => 
      new Date(record.date).toDateString() === attendanceDate.toDateString()
    );
    
    if (!attendanceRecord) {
      // Create new attendance record
      attendanceRecord = {
        date: attendanceDate,
        loginTime: null, // Don't set login time automatically
        logoutTime: null, // Don't set logout time automatically
        totalHours: status === 'present' ? 8 : (status === 'leave' || status === 'permission') ? 4 : 0,
        status: status // Store the actual status
      };
      user.attendanceRecords.push(attendanceRecord);
    } else {
      // Update existing record - preserve existing login/logout times
      const originalLoginTime = attendanceRecord.loginTime;
      const originalLogoutTime = attendanceRecord.logoutTime;
      
      // Update the status
      attendanceRecord.status = status;
      
      // Update total hours based on status
      if (status === 'present') {
        attendanceRecord.totalHours = 8;
      } else if (status === 'leave' || status === 'permission') {
        attendanceRecord.totalHours = 4;
      } else {
        attendanceRecord.totalHours = 0;
      }
      
      // Preserve original login/logout times
      attendanceRecord.loginTime = originalLoginTime;
      attendanceRecord.logoutTime = originalLogoutTime;
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
          // Use the stored status if available, otherwise determine from data
          let status = record.status;
          
          // If no stored status, determine from data
          if (!status) {
            if (record.loginTime && record.logoutTime) {
              status = 'present';
            } else if (record.loginTime) {
              status = 'logged-in';
            } else if (record.totalHours > 0) {
              // For manually marked attendance
              if (record.totalHours >= 8) {
                status = 'present';
              } else if (record.totalHours >= 4) {
                // This could be either leave or permission
                // We'll default to 'leave' for now
                status = 'leave';
              } else {
                status = 'present';
              }
            } else {
              status = 'absent';
            }
          }
          
          attendanceData.push({
            username: user.username,
            userGroup: user.userGroup,
            date: record.date,
            loginTime: record.loginTime,
            logoutTime: record.logoutTime,
            totalHours: record.totalHours,
            status: status // Always use the determined status
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
    
    // Get all users (not just those with attendance records) - include name field
    const allUsers = await User.find().select('username name userGroup attendanceRecords');
    
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
    const headerRow = ['Full Name'];
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
      
      // Create row for this user - use full name if available, otherwise username
      const userRow = [user.name || user.username];
      
      // Track counts for summary
      let presentCount = 0;
      let loggedInCount = 0;
      let absentCount = 0;
      
      // Add attendance status for each date
      datesInMonth.forEach(date => {
        const dateKey = date.getDate();
        const record = userAttendanceMap[dateKey];
        
        if (record) {
          // Use stored status if available
          if (record.status) {
            switch (record.status) {
              case 'present':
                userRow.push('P'); // Present
                presentCount++;
                break;
              case 'logged-in':
                userRow.push('LI'); // Logged In
                loggedInCount++;
                break;
              case 'leave':
                userRow.push('L'); // Leave
                presentCount++; // Count leave as present for summary purposes
                break;
              case 'permission':
                userRow.push('P'); // Permission (using P for now)
                presentCount++; // Count permission as present for summary purposes
                break;
              case 'absent':
                userRow.push('A'); // Absent
                absentCount++;
                break;
              default:
                userRow.push('A'); // Absent
                absentCount++;
            }
          } else {
            // Fallback to old logic if status is not available
            if (record.loginTime && record.logoutTime) {
              userRow.push('P'); // Present (logged in and out)
              presentCount++;
            } else if (record.loginTime) {
              userRow.push('LI'); // Logged In
              loggedInCount++;
            } else if (record.totalHours > 0) {
              // Manually marked as present
              userRow.push('P'); // Present
              presentCount++;
            } else {
              userRow.push('A'); // Absent
              absentCount++;
            }
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
    worksheet.getColumn(1).width = 25; // Full Name column
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