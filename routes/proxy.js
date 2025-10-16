const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsapp');

// GET /api/nominatim-reverse?lat=...&lon=...
router.get('/nominatim-reverse', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon query parameters are required' });
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CRMApp/1.0 (your@email.com)'
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from Nominatim' });
    }
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch from Nominatim' });
  }
});

// POST /api/send-whatsapp
router.post('/send-whatsapp', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }
    
    // Send WhatsApp message
    const result = await sendWhatsAppMessage(phone, message);
    
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }
});

module.exports = router;