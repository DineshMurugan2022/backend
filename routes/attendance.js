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

// GET /api/users/attendance/:year/:month - Get attendance data for a specific month
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
    
    // Find users with attendance records in the specified month
    const users = await User.find({
      'attendanceRecords.date': { $gte: startDate, $lte: endDate }
    }).select('username userGroup attendanceRecords');
    
    // Format the data
    const attendanceData = [];
    users.forEach(user => {
      user.attendanceRecords.forEach(record => {
        const recordDate = new Date(record.date);
        if (recordDate >= startDate && recordDate <= endDate) {
          attendanceData.push({
            username: user.username,
            userGroup: user.userGroup,
            date: record.date,
            loginTime: record.loginTime,
            logoutTime: record.logoutTime,
            totalHours: record.totalHours
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
    
    // Find users with attendance records in the specified month
    const users = await User.find({
      'attendanceRecords.date': { $gte: startDate, $lte: endDate }
    }).select('username userGroup attendanceRecords');
    
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');
    
    // Define columns
    worksheet.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'User Group', key: 'userGroup', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Login Time', key: 'loginTime', width: 25 },
      { header: 'Logout Time', key: 'logoutTime', width: 25 },
      { header: 'Total Hours', key: 'totalHours', width: 15 }
    ];
    
    // Add data to worksheet
    users.forEach(user => {
      user.attendanceRecords.forEach(record => {
        const recordDate = new Date(record.date);
        if (recordDate >= startDate && recordDate <= endDate) {
          worksheet.addRow({
            username: user.username,
            userGroup: user.userGroup,
            date: record.date ? record.date.toISOString().split('T')[0] : '',
            loginTime: record.loginTime ? record.loginTime.toLocaleString() : '',
            logoutTime: record.logoutTime ? record.logoutTime.toLocaleString() : '',
            totalHours: record.totalHours || 0
          });
        }
      });
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