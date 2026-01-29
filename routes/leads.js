const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const multer = require('multer');
const path = require('path');
const LeadFile = require('../models/LeadFile');
const { leadStorage } = require('../services/cloudinary');
const auth = require('../middleware/auth'); // Import auth middleware

// Set up multer storage using Cloudinary
const upload = multer({ storage: leadStorage });

// POST /api/leads - Create a new lead
router.post('/', auth, async (req, res) => {
  try {
    const lead = new Lead(req.body);
    await lead.save();
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leads - Get all leads (cached for 5 minutes)
router.get('/', auth, async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id - Delete a lead
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Lead.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leads/:id - Update a lead
router.put('/:id', auth, async (req, res) => {
  try {
    const updated = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/leads/:leadId/upload - Upload a file for a lead
router.post('/:leadId/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { title } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const leadFile = new LeadFile({
      lead: req.params.leadId,
      title,
      filename: req.file.path, // Store Cloudinary secure URL or path
      originalname: req.file.originalname,
    });
    await leadFile.save();
    res.status(201).json(leadFile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:leadId/files - List files for a lead (cached for 5 minutes)
router.get('/:leadId/files', auth, async (req, res) => {
  try {
    const files = await LeadFile.find({ lead: req.params.leadId }).sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/files/:fileId - Serve/download a file
router.get('/files/:fileId', auth, async (req, res) => {
  try {
    const file = await LeadFile.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Check if the filename is a full URL (Cloudinary) or just a filename (Legacy)
    if (file.filename.startsWith('http')) {
      res.redirect(file.filename);
    } else {
      const filePath = path.join(__dirname, '../uploads/', file.filename);
      res.download(filePath, file.originalname);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk DELETE /api/leads/bulk-delete
router.delete('/bulk-delete', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    await Lead.deleteMany({ _id: { $in: ids } });
    res.json({ message: `${ids.length} leads deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk PATCH /api/leads/bulk-assign
router.patch('/bulk-assign', auth, async (req, res) => {
  try {
    const { ids, userId } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    if (!userId) return res.status(400).json({ error: 'No user ID provided' });
    await Lead.updateMany({ _id: { $in: ids } }, { assignedTo: userId });
    res.json({ message: `${ids.length} leads assigned` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk PATCH /api/leads/bulk-update
router.patch('/bulk-update', auth, async (req, res) => {
  try {
    const { ids, update } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
    await Lead.updateMany({ _id: { $in: ids } }, update);
    res.json({ message: `${ids.length} leads updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;