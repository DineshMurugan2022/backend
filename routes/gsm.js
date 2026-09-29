// gsm.js - Unified GSM Modem API router in backend
const express = require('express');
const router = express.Router();
const gsmModemService = require('../services/gsmModemService');

let socketExecuteAction = null;
try {
  const handlers = require('../sockets/gsmHandlers');
  socketExecuteAction = handlers.executeAction;
} catch {
  // gsmHandlers may not be available in all environments
}

// GET /api/gsm/state
router.get('/state', (req, res) => {
  try {
    const state = gsmModemService.getStatus();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gsm/devices
router.get('/devices', async (req, res) => {
  try {
    let devices;
    try {
      devices = await gsmModemService.getDevices();
      if (devices && devices.ports && devices.ports.length > 0) {
        return res.json(devices);
      }
    } catch {
      // Degrade gracefully
    }

    // Try Socket.IO relay (query connected Modem PC for serial ports!)
    if (socketExecuteAction) {
      try {
        devices = await socketExecuteAction('devices');
        if (devices && Array.isArray(devices.ports)) {
          return res.json(devices);
        }
      } catch {
        // Relay offline or timed out
      }
    }

    res.json(devices || { ports: [], audio: [], audioError: 'No hardware modem available on this server.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gsm/:action (connect, disconnect, dial, answer, hangup, mute, diagnostics)
router.post('/:action', async (req, res) => {
  const action = req.params.action;
  const payload = req.body || {};

  try {
    let result;
    let lastErr;

    // 1. Try integrated modem service first
    try {
      result = await gsmModemService.executeAction(action, payload);
      return res.json(result);
    } catch (err) {
      lastErr = err;
    }

    // 2. Try Socket.IO relay (modem PC forwarded state)
    if (socketExecuteAction) {
      try {
        result = await socketExecuteAction(action, payload);
        return res.json(result);
      } catch (err) {
        lastErr = err;
      }
    }

    // 3. Both failed — return a helpful 503 so the frontend knows to fallback
    //    to the direct modem server (3174) or show the right error to the user.
    return res.status(503).json({
      error: lastErr?.message || 'GSM modem not available on this server.',
      hint: 'Use Start-GSM-Modem.bat on the modem PC, then enter the modem PC LAN IP in the Modem Server Address field.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
