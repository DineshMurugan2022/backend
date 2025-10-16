const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const jwt = require("jsonwebtoken");
const { getIOInstance } = require("../sockets/io"); // Import socket instance

const JWT_SECRET = process.env.JWT_SECRET || "your_fallback_secret";

// Middleware to check JWT
const requireAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

// GET stats for a specific month/year
router.get("/stats", requireAuth, async (req, res) => {
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
router.get("/revenue", requireAuth, async (req, res) => {
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
    
    // Calculate revenue for current month (signed appointments with contract value and payment received)
    const currentMonthRevenue = await Appointment.aggregate([
      {
        $match: {
          signed: true,
          clearancePending: false, // Only include appointments where payment is received (not pending)
          date: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$contractValue" }
        }
      }
    ]);
    
    // Calculate revenue for previous month
    const previousMonthRevenue = await Appointment.aggregate([
      {
        $match: {
          signed: true,
          clearancePending: false, // Only include appointments where payment is received (not pending)
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$contractValue" }
        }
      }
    ]);
    
    res.json({
      currentMonth: currentMonthRevenue[0]?.total || 0,
      previousMonth: previousMonthRevenue[0]?.total || 0
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
});

// GET all appointments - exclude those deleted by the current user
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Returns appointments that are NOT deleted for the current user
    const appointments = await Appointment.find({ 
      deletedFor: { $ne: userId },
      createdBy: userId
    }).populate('createdBy', 'username').sort({ date: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// GET all appointments for admin/telecaller - show all appointments
router.get("/all", requireAuth, async (req, res) => {
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
    const appointments = await Appointment.find(query).populate('createdBy', 'username userGroup').sort({ date: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// GET telecaller appointments only - show appointments created by telecallers (userGroup = "user")
router.get("/telecaller", requireAuth, async (req, res) => {
  try {
    // Returns appointments created by telecaller users only
    const appointments = await Appointment.find({})
      .populate({
        path: 'createdBy',
        select: 'username userGroup',
        match: { userGroup: 'user' } // Only populate if createdBy is a telecaller
      })
      .sort({ date: -1 });
    
    // Filter out appointments where createdBy doesn't match (telecallers only)
    const telecallerAppointments = appointments.filter(app => app.createdBy && app.createdBy.userGroup === 'user');
    
    res.json(telecallerAppointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// POST new appointment
router.post("/", requireAuth, async (req, res) => {
  try {
    // Add a check for the user ID from the token
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload. Please log out and log in again.' });
    }
    
    // Log the user object from the token to debug
    console.log('User from token:', req.user);
    console.log('Saving appointment with createdBy:', userId);

    const { client, companyName, date, met, signed, contractValue, clearancePending, follow, renewal } = req.body;

    if (!client || !date) {
      return res.status(400).json({ error: "Client and date are required." });
    }

    const appointment = new Appointment({
      client,
      companyName: companyName || '', // Add companyName field
      date,
      met: met || false,
      signed: signed || false,
      contractValue: contractValue || 0,
      clearancePending: clearancePending || false,
      follow: follow || false,
      renewal: renewal || 'fresh', // Add renewal field with default value
      createdBy: userId,
      deletedFor: [] // Initialize as empty array
    });

    const saved = await appointment.save();
    
    // Populate the createdBy field for the response
    await saved.populate('createdBy', 'username');
    
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
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Remove the user from deletedFor list when appointment is updated
    const updates = { ...req.body };
    
    const updated = await Appointment.findByIdAndUpdate(
      req.params.id, 
      { ...updates, $pull: { deletedFor: userId } },
      { new: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    
    // Populate the createdBy field for the response
    await updated.populate('createdBy', 'username');
    
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
router.delete("/:id", requireAuth, async (req, res) => {
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
router.delete("/:id/hard", requireAuth, async (req, res) => {
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

module.exports = router;