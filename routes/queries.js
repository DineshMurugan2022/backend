const express = require('express');
const router = express.Router();
const Query = require('../models/Query');
const auth = require('../middleware/auth');

// Get all queries
router.get('/', auth, async (req, res) => {
  try {
    const queries = await Query.find()
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 });

    res.json(queries);
  } catch (err) {
    console.error('Error fetching queries:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add a new query
router.post('/', auth, async (req, res) => {
  try {
    const query = new Query({
      ...req.body,
      createdBy: req.user._id // Assign creator
    });
    const savedQuery = await query.save();
    const populatedQuery = await savedQuery.populate('createdBy', 'name username');
    res.status(201).json(populatedQuery);
  } catch (err) {
    console.error('Error adding query:', err);
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
      { new: true, runValidators: true }
    ).populate('createdBy', 'name username');

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (err) {
    console.error('Error assigning query:', err);
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
      { new: true, runValidators: true }
    ).populate('createdBy', 'name username');

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (err) {
    console.error('Error updating days to complete:', err);
    res.status(400).json({ error: err.message });
  }
});

// Update a query (General update)
router.put('/:id', auth, async (req, res) => {
  try {
    const query = await Query.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name username');

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (err) {
    console.error('Error updating query:', err);
    res.status(400).json({ error: err.message });
  }
});

// Update status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const query = await Query.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name username');

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete a query
router.delete('/:id', auth, async (req, res) => {
  try {
    const query = await Query.findByIdAndDelete(req.params.id);
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    res.json({ message: 'Query deleted successfully' });
  } catch (err) {
    console.error('Error deleting query:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;