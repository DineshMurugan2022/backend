const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const RevenueReport = require("../models/RevenueReport");
const auth = require("../middleware/auth");
const { getIOInstance } = require("../sockets/io"); // Import socket instance
const ExcelJS = require('exceljs');

// Middleware to check JWT (This block is removed as per instruction, replaced by auth middleware)
// const requireAuth = (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   console.log("Auth header received:", authHeader);

//   if (!authHeader?.startsWith("Bearer ")) {
//     console.log("No valid authorization header found");
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   const token = authHeader.split(" ")[1];
//   console.log("Token extracted:", token ? "Present" : "Missing");

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     console.log("Token verified successfully:", decoded);
//     req.user = decoded;
//     next();
//   } catch (error) {
//     console.error("JWT verification error:", error.message);
//     return res.status(401).json({ message: "Invalid token" });
//   }
// };

// GET stats for a specific month/year
router.get("/stats", auth, async (req, res) => {
  try {
    const { month, year } = req.query;

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid month or year" });
    }

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Count appointments in the date range
    const total = await Appointment.countDocuments({
      date: { $gte: startDate, $lte: endDate }
    });

    res.json({ total });
  } catch (error) {
    console.error("Error fetching appointment stats:", error);
    res.status(500).json({ error: "Failed to fetch appointment stats" });
  }
});

// GET revenue data
router.get("/revenue", auth, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Create date ranges
    const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    const previousMonthStart = new Date(previousYear, previousMonth - 1, 1);
    const previousMonthEnd = new Date(previousYear, previousMonth, 0, 23, 59, 59, 999);

    // Build query based on user role
    let query = {
      signed: true,
      contractValue: { $gt: 0 },
      date: { $gte: currentMonthStart, $lte: currentMonthEnd }
    };

    let previousQuery = {
      signed: true,
      contractValue: { $gt: 0 },
      date: { $gte: previousMonthStart, $lte: previousMonthEnd }
    };

    // For BDM users, only show their own appointments (created by them or assigned to them)
    if (req.user.userGroup === 'bdm') {
      query.$or = [
        { createdBy: req.user.id || req.user._id },
        { assignedBDM: req.user.id || req.user._id }
      ];

      previousQuery.$or = [
        { createdBy: req.user.id || req.user._id },
        { assignedBDM: req.user.id || req.user._id }
      ];
    }
    // For telecaller users, only show appointments they created
    else if (req.user.userGroup === 'user') {
      query.createdBy = req.user.id || req.user._id;
      previousQuery.createdBy = req.user.id || req.user._id;
    }
    // Admin users see all appointments (no additional filtering needed)

    // Calculate net sales for current month (signed appointments with contract value, minus pending amounts)
    const currentMonthAppointments = await Appointment.find(query);

    const currentMonthRevenue = currentMonthAppointments.reduce((sum, appointment) => {
      const contractValue = Number(appointment.contractValue) || 0;
      const clearanceAmount = (appointment.clearancePending && Number(appointment.clearanceAmount)) || 0;
      return sum + (contractValue - clearanceAmount);
    }, 0);

    // Calculate net sales for previous month
    const previousMonthAppointments = await Appointment.find(previousQuery);

    const previousMonthRevenue = previousMonthAppointments.reduce((sum, appointment) => {
      const contractValue = Number(appointment.contractValue) || 0;
      const clearanceAmount = (appointment.clearancePending && Number(appointment.clearanceAmount)) || 0;
      return sum + (contractValue - clearanceAmount);
    }, 0);

    res.json({
      currentMonth: currentMonthRevenue,
      previousMonth: previousMonthRevenue
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
});

// GET all revenue reports
router.get("/revenue/reports", auth, async (req, res) => {
  try {
    const reports = await RevenueReport.find().sort({ year: -1, month: -1 });
    res.json(reports);
  } catch (error) {
    console.error("Error fetching revenue reports:", error);
    res.status(500).json({ error: "Failed to fetch revenue reports" });
  }
});

// POST generate and store monthly revenue report
router.post("/revenue/report", auth, async (req, res) => {
  try {
    console.log("Revenue report generation requested:", req.body);
    const { month, year } = req.body;

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid month or year" });
    }

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all appointments for the month
    const appointments = await Appointment.find({
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculate statistics
    const totalContracts = appointments.length;
    const signedAppointments = appointments.filter(a => a.signed);

    // Calculate total revenue (sum of all contract values)
    const totalRevenue = signedAppointments.reduce((sum, appointment) => {
      return sum + (Number(appointment.contractValue) || 0);
    }, 0);

    // Calculate net sales (sum of contract values minus pending amounts)
    const netSales = signedAppointments.reduce((sum, appointment) => {
      const contractValue = Number(appointment.contractValue) || 0;
      const clearanceAmount = (appointment.clearancePending && Number(appointment.clearanceAmount)) || 0;
      return sum + (contractValue - clearanceAmount);
    }, 0);

    // Calculate pending amounts
    const pendingAmounts = signedAppointments.reduce((sum, appointment) => {
      return sum + (appointment.clearancePending ? (Number(appointment.clearanceAmount) || 0) : 0);
    }, 0);

    // Check if report already exists for this month/year
    let report = await RevenueReport.findOne({ month: monthNum, year: yearNum });

    if (report) {
      // Update existing report
      report.totalContracts = totalContracts;
      report.totalRevenue = totalRevenue;
      report.netSales = netSales;
      report.pendingAmounts = pendingAmounts;
      await report.save();
    } else {
      // Create new report
      report = new RevenueReport({
        month: monthNum,
        year: yearNum,
        totalContracts,
        totalRevenue,
        netSales,
        pendingAmounts
      });
      await report.save();
    }

    console.log("Revenue report generated successfully:", { month: monthNum, year: yearNum });
    res.json({
      success: true,
      message: "Revenue report generated and stored successfully",
      report
    });
  } catch (error) {
    console.error("Error generating revenue report:", error);
    res.status(500).json({ error: "Failed to generate revenue report" });
  }
});

// GET revenue report for a specific month/year
router.get("/revenue/report/:month/:year", auth, async (req, res) => {
  try {
    const { month, year } = req.params;

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid month or year" });
    }

    const report = await RevenueReport.findOne({ month: monthNum, year: yearNum });

    if (report) {
      return res.json(report);
    }

    // If report not found, calculate from live data
    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all appointments for the month
    const appointments = await Appointment.find({
      date: { $gte: startDate, $lte: endDate }
    });

    const totalContracts = appointments.length;
    const signedAppointments = appointments.filter(a => a.signed);

    const totalRevenue = signedAppointments.reduce((sum, appointment) => {
      return sum + (Number(appointment.contractValue) || 0);
    }, 0);

    const netSales = signedAppointments.reduce((sum, appointment) => {
      const contractValue = Number(appointment.contractValue) || 0;
      const clearanceAmount = (appointment.clearancePending && Number(appointment.clearanceAmount)) || 0;
      return sum + (contractValue - clearanceAmount);
    }, 0);

    const pendingAmounts = signedAppointments.reduce((sum, appointment) => {
      return sum + (appointment.clearancePending ? (Number(appointment.clearanceAmount) || 0) : 0);
    }, 0);

    // Return calculated data structure matching the report model
    res.json({
      month: monthNum,
      year: yearNum,
      totalContracts,
      totalRevenue,
      netSales,
      pendingAmounts,
      isLive: true // Flag to indicate this is live data
    });
  } catch (error) {
    console.error("Error fetching revenue report:", error);
    res.status(500).json({ error: "Failed to fetch revenue report" });
  }
});

// GET revenue report download as Excel
router.get("/revenue/report/:month/:year/download", auth, async (req, res) => {
  try {
    console.log("Revenue report download requested:", req.params);
    const { month, year } = req.params;

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid month or year" });
    }

    // Create date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all appointments for the month
    const appointments = await Appointment.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('createdBy', 'username');

    // Get the stored report
    const report = await RevenueReport.findOne({ month: monthNum, year: yearNum });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Revenue Report');

    // Add title row
    worksheet.addRow([`Monthly Revenue Report - ${new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' })} ${yearNum}`]);
    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add report summary if available
    if (report) {
      worksheet.addRow([]);
      worksheet.addRow(['Report Summary']);
      worksheet.getCell('A3').font = { bold: true };

      worksheet.addRow(['Total Contracts', report.totalContracts]);
      worksheet.addRow(['Total Revenue', `₹${report.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
      worksheet.addRow(['Net Sales', `₹${report.netSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
      worksheet.addRow(['Pending Amounts', `₹${report.pendingAmounts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);

      // Style the summary section
      for (let i = 4; i <= 7; i++) {
        worksheet.getCell(`A${i}`).font = { bold: true };
      }
    }

    // Add appointments data header
    worksheet.addRow([]);
    worksheet.addRow(['Appointments Details']);
    worksheet.getCell('A9').font = { bold: true };

    // Add column headers
    const headerRow = ['Date', 'Client', 'Company', 'Contract Value', 'Status', 'Created By'];
    worksheet.addRow(headerRow);

    // Style header row
    const headerRowObj = worksheet.lastRow;
    headerRowObj.font = { bold: true };
    headerRowObj.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRowObj.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };

    // Add appointment data
    appointments.forEach(appointment => {
      const status = appointment.signed ? 'Signed' : (appointment.met ? 'Met' : 'Pending');
      const contractValue = appointment.contractValue || 0;

      worksheet.addRow([
        new Date(appointment.date).toLocaleDateString('en-IN'),
        appointment.client,
        appointment.companyName || '-',
        `₹${contractValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        status,
        appointment.createdBy ? appointment.createdBy.username : 'Unknown'
      ]);
    });

    // Auto-filter for the data
    worksheet.autoFilter = {
      from: 'A10',
      to: `F${10 + appointments.length}`
    };

    // Set column widths
    worksheet.columns = [
      { width: 15 }, // Date
      { width: 25 }, // Client
      { width: 25 }, // Company
      { width: 15 }, // Contract Value
      { width: 15 }, // Status
      { width: 20 }  // Created By
    ];

    // Set response headers
    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=revenue_report_${monthName}_${yearNum}.xlsx`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    console.log("Revenue report downloaded successfully:", { month: monthNum, year: yearNum });
  } catch (error) {
    console.error("Error generating revenue report download:", error);
    res.status(500).json({ error: "Failed to generate revenue report download" });
  }
});

// ✅ Get appointments for BDM (both created by and assigned to them)
router.get("/bdm", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const appointments = await Appointment.find({
      $or: [{ createdBy: userId }, { assignedBDM: userId }],
    })
      .populate("createdBy", "username userGroup")
      .populate("assignedBDM", "username userGroup")
      .sort({ date: -1 });

    console.log(`Found ${appointments.length} appointments for BDM user`);
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching BDM appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET all appointments// GET /api/appointments - Get all appointments
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Get filter parameters
    const { createdBy } = req.query;

    // Build query object
    const query = {
      deletedFor: { $ne: userId }
    };

    // For BDM users, return appointments they created OR appointments assigned to them
    if (req.user.userGroup === 'bdm') {
      query.$or = [
        { createdBy: userId },
        { assignedBDM: userId }
      ];
    }
    // For other users (telecaller), return only appointments they created
    else if (req.user.userGroup === 'user') {
      query.createdBy = userId;
    }
    // Admin users see all appointments (no additional filtering needed for createdBy/assignedBDM)
    // If createdBy filter is provided, apply it
    if (createdBy) {
      query.createdBy = createdBy;
    }

    const appointments = await Appointment.find(query)
      .populate({ path: 'createdBy', select: 'username deleted' })
      .populate({ path: 'assignedBDM', select: 'username' })
      .sort({ date: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// GET all appointments for admin/telecaller - show all appointments
router.get("/all", auth, async (req, res) => {
  try {
    // Get filter parameters
    const { createdBy } = req.query;

    // Build query object
    const query = {};

    // Apply BDM filter if provided
    if (createdBy) {
      query.createdBy = createdBy;
    }

    // Returns ALL appointments for admin/telecaller view
    const appointments = await Appointment.find(query)
      .populate({ path: 'createdBy', select: 'username userGroup deleted' })
      .populate({ path: 'assignedBDM', select: 'username' })
      .sort({ date: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// GET telecaller appointments only - show appointments created by telecallers (userGroup = "user")
router.get("/telecaller", auth, async (req, res) => {
  try {
    // Returns appointments created by telecaller users only
    const appointments = await Appointment.find({})
      .populate({ path: 'createdBy', select: 'username userGroup deleted' })
      .populate({ path: 'assignedBDM', select: 'username' })
      .sort({ date: -1 });

    // Filter out appointments where createdBy doesn't match (telecallers only)
    const telecallerAppointments = appointments.filter(app => app.createdBy && app.createdBy.userGroup === 'user');

    res.json(telecallerAppointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// GET /api/appointments/search - Find appointment by phone number to auto-fill leads
router.get('/search', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number query parameter is required' });
    }

    // Use regex to strip non-digit formatting for robust search
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 5) {
      return res.status(404).json({ error: 'Phone number too short for accurate search' });
    }

    // Try to find the most recent appointment matching the final digits (ignoring country codes potentially)
    const regex = new RegExp(`.*${digitsOnly.slice(-10)}$`); // Match the last 10 digits
    const appointment = await Appointment.findOne({ mobileNumber: { $regex: regex } })
      .sort({ createdAt: -1 });

    if (!appointment) {
      return res.status(404).json({ message: 'No lead found with this phone number' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error during appointment phone search:', error);
    res.status(500).json({ error: 'Failed to search for lead details' });
  }
});

// POST /api/appointments - Create a new appointment
router.post("/", auth, async (req, res) => {
  try {
    // Add a check for the user ID from the token
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload. Please log out and log in again.' });
    }

    const {
      client, companyName, date, met, signed, contractValue,
      clearancePending, clearanceAmount, follow, followDate, renewal,
      assignedBDM, remark, mobileNumber, alternateNumber, category,
      designation, landmark, address, pinNumber, notes
    } = req.body;

    if (!client || !date) {
      return res.status(400).json({ error: "Client and date are required." });
    }

    const appointment = new Appointment({
      client,
      companyName: companyName || '',
      date,
      met: met || false,
      signed: signed || false,
      contractValue: contractValue || 0,
      clearancePending: clearancePending || false,
      clearanceAmount: clearanceAmount || 0,
      follow: follow || false,
      followDate: followDate || null,
      renewal: renewal || 'fresh',
      assignedBDM: assignedBDM || null,
      remark: remark || '',
      mobileNumber: mobileNumber || '',
      alternateNumber: alternateNumber || '',
      category: category || '',
      designation: designation || '',
      landmark: landmark || '',
      address: address || '',
      pinNumber: pinNumber || '',
      notes: notes || '',
      createdBy: userId,
      deletedFor: [] // Initialize as empty array
    });

    const saved = await appointment.save();

    // Populate the createdBy and assignedBDM fields for the response
    await saved.populate({ path: 'createdBy', select: 'username deleted' });
    await saved.populate({ path: 'assignedBDM', select: 'username' });

    // Emit socket event for new appointment
    const io = getIOInstance();
    if (io) {
      io.emit('appointmentUpdated', { action: 'created', appointment: saved });
    }

    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to save" });
  }
});

// PUT update appointment
router.put("/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Remove the user from deletedFor list when appointment is updated
    const {
      client, companyName, date, met, signed, contractValue,
      clearancePending, clearanceAmount, follow, followDate, renewal,
      assignedBDM, remark, mobileNumber, alternateNumber, category,
      designation, landmark, address, pinNumber, notes
    } = req.body;

    const updates = {
      client,
      companyName: companyName || '',
      date,
      met: met || false,
      signed: signed || false,
      contractValue: contractValue || 0,
      clearancePending: clearancePending || false,
      clearanceAmount: clearanceAmount || 0,
      follow: follow || false,
      followDate: followDate || null,
      renewal: renewal || 'fresh',
      assignedBDM: assignedBDM || null,
      remark: remark || '',
      mobileNumber: mobileNumber || '',
      alternateNumber: alternateNumber || '',
      category: category || '',
      designation: designation || '',
      landmark: landmark || '',
      address: address || '',
      pinNumber: pinNumber || '',
      notes: notes || '',
    };

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { ...updates, $pull: { deletedFor: userId } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Populate the createdBy and assignedBDM fields for the response
    await updated.populate({ path: 'createdBy', select: 'username deleted' });
    await updated.populate({ path: 'assignedBDM', select: 'username' });

    // Emit socket event for updated appointment
    const io = getIOInstance();
    if (io) {
      io.emit('appointmentUpdated', { action: 'updated', appointment: updated });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error during appointment update:", error);
    res.status(400).json({ error: error.message || "Failed to update appointment." });
  }
});

// Soft DELETE appointment - only hide from current user
router.delete("/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Add user to deletedFor array (soft delete)
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { deletedFor: userId } }, // $addToSet prevents duplicates
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    // Emit socket event for deleted appointment
    const io = getIOInstance();
    if (io) {
      io.emit('appointmentUpdated', { action: 'deleted', appointment: updated });
    }

    res.json({ message: "Appointment hidden successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to hide appointment" });
  }
});

// Hard DELETE appointment - completely remove from database (admin only)
router.delete("/:id/hard", auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.userGroup !== 'admin') {
      return res.status(403).json({ error: "Only admin users can permanently delete appointments" });
    }

    const deleted = await Appointment.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    // Emit socket event for hard deleted appointment
    const io = getIOInstance();
    if (io) {
      io.emit('appointmentUpdated', { action: 'hardDeleted', appointment: deleted });
    }

    res.json({ message: "Appointment deleted permanently" });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to delete" });
  }
});

// Bulk DELETE /api/appointments/bulk-delete
router.delete('/bulk-delete', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id || req.user._id;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });

    if (req.user.userGroup === 'admin') {
      // Hard delete for admins
      await Appointment.deleteMany({ _id: { $in: ids } });
    } else {
      // Soft delete (hide) for others
      await Appointment.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { deletedFor: userId } }
      );
    }
    res.json({ message: `${ids.length} appointments deleted/hidden` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk PATCH /api/appointments/bulk-assign
router.patch('/bulk-assign', auth, async (req, res) => {
  try {
    if (req.user.userGroup !== 'admin' && req.user.userGroup !== 'teamleader') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { ids, userId } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    await Appointment.updateMany({ _id: { $in: ids } }, { assignedBDM: userId });
    res.json({ message: `${ids.length} appointments assigned` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk PATCH /api/appointments/bulk-update
router.patch('/bulk-update', auth, async (req, res) => {
  try {
    const { ids, update } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    await Appointment.updateMany({ _id: { $in: ids } }, update);
    res.json({ message: `${ids.length} appointments updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;