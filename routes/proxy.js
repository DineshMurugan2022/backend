const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

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

module.exports = router; 