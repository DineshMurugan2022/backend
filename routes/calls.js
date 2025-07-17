const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');

// POST /api/calls - Add a new call log
router.post('/', async (req, res) => {
  try {
    const { phoneNumber, personName, companyName } = req.body;
    if (!phoneNumber || !personName || !companyName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const log = new CallLog({ phoneNumber, personName, companyName });
    await log.save();
    res.status(201).json(log);
  } catch {
    res.status(500).json({ error: 'Failed to log call' });
  }
});

// GET /api/calls - Get all call logs, or filter by phone
router.get('/', async (req, res) => {
  try {
    const { phone } = req.query;
    let logs;
    if (phone) {
      logs = await CallLog.find({ phoneNumber: phone }).sort({ callTime: -1 });
    } else {
      logs = await CallLog.find().sort({ callTime: -1 });
    }
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
});

module.exports = router; 