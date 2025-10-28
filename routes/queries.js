const express = require('express');
const router = express.Router();
const Query = require('../models/Query');
const auth = require('../middleware/auth');

// Get all queries
router.get('/', auth, async (req, res) => {
  try {
    const queries = await Query.find().sort({ createdAt: -1 });
    res.json(queries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new query
router.post('/', auth, async (req, res) => {
  try {
    const query = new Query(req.body);
    await query.save();
    res.status(201).json(query);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Assign a query to a tech user
router.patch('/:id/assign', auth, async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const query = await Query.findByIdAndUpdate(
      req.params.id,
      { assignedTo },
      { new: true }
    );
    res.json(query);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update days to complete
router.patch('/:id/days', auth, async (req, res) => {
  try {
    const { daysToComplete } = req.body;
    const query = await Query.findByIdAndUpdate(
      req.params.id,
      { daysToComplete },
      { new: true }
    );
    res.json(query);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
