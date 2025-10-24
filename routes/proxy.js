const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsapp');
const auth = require('../middleware/auth'); // Import auth middleware

// GET /api/nominatim-reverse?lat=...&lon=...
router.get('/nominatim-reverse', auth, async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon query parameters are required' });
  }

  // Validate coordinates
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  
  try {
    console.log(`🌍 Fetching address for coordinates: ${lat}, ${lon}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CRM-App/1.0 (contact@yourcompany.com)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
      timeout: 15000, // Increased timeout to 15 seconds
      follow: 3, // Follow redirects
      compress: true
    });

    if (!response.ok) {
      console.error(`❌ Nominatim API error: ${response.status} ${response.statusText}`);
      return res.status(200).json({ // Changed to 200 to avoid frontend errors
        display_name: `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}`, // Fallback coordinates
        error: `Nominatim API error: ${response.status}`
      });
    }

    const data = await response.json();
    console.log(`✅ Address resolved: ${data.display_name || 'Unknown'}`);
    
    // Ensure we always return a display_name
    if (!data.display_name) {
      data.display_name = `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}`;
    }
    
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching from Nominatim:', error.message);
    
    // Return fallback coordinates with 200 status to prevent frontend errors
    res.status(200).json({
      display_name: `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}`,
      error: 'Address service unavailable, showing coordinates'
    });
  }
});

// POST /api/send-whatsapp
router.post('/send-whatsapp', auth, async (req, res) => {
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