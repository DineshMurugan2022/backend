const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const jwt = require("jsonwebtoken");

// Middleware to check JWT
const requireAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// GET all appointments
router.get("/", requireAuth, async (req, res) => {
  try {
    // Returns ALL appointments for any logged-in user
    const appointments = await Appointment.find({}).sort({ date: -1 });
    res.json(appointments);
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

    const { client, date, met, signed, contractValue, clearancePending, follow } = req.body;

    if (!client || !date) {
      return res.status(400).json({ error: "Client and date are required." });
    }

    const appointment = new Appointment({
      client,
      date,
      met: met || false,
      signed: signed || false,
      contractValue: contractValue || 0,
      clearancePending: clearancePending || false,
      follow: follow || false,
      createdBy: userId,
    });

    const saved = await appointment.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to save" });
  }
});

// PUT update appointment
router.put("/:id", requireAuth, async (req, res) => {
  try {
    // Any logged-in user can update any appointment
    const updated = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error during appointment update:", error);
    res.status(400).json({ error: error.message || "Failed to update appointment." });
  }
});

// DELETE appointment
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    // Any logged-in user can delete any appointment
    const deleted = await Appointment.findByIdAndDelete(req.params.id);
     if (!deleted) {
      return res.status(404).json({ error: "Appointment not found." });
    }
    res.json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to delete" });
  }
});


module.exports = router;