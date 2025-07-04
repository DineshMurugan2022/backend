const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const multer = require('multer');
const path = require('path');
const LeadFile = require('../models/LeadFile');

// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// POST /api/leads - Create a new lead
router.post('/', async (req, res) => {
  try {
    const lead = new Lead(req.body);
    await lead.save();
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leads - Get all leads
router.get('/', async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id - Delete a lead
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Lead.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leads/:id - Update a lead
router.put('/:id', async (req, res) => {
  try {
    const updated = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/leads/:leadId/upload - Upload a file for a lead
router.post('/:leadId/upload', upload.single('file'), async (req, res) => {
  try {
    const { title } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const leadFile = new LeadFile({
      lead: req.params.leadId,
      title,
      filename: req.file.filename,
      originalname: req.file.originalname,
    });
    await leadFile.save();
    res.status(201).json(leadFile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:leadId/files - List files for a lead
router.get('/:leadId/files', async (req, res) => {
  try {
    const files = await LeadFile.find({ lead: req.params.leadId }).sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/files/:fileId - Serve/download a file
router.get('/files/:fileId', async (req, res) => {
  try {
    const file = await LeadFile.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(__dirname, '../uploads/', file.filename);
    res.download(filePath, file.originalname);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 