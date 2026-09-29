// gsm.js - Unified GSM Modem API router in backend
const express = require('express');
const router = express.Router();
const gsmModemService = require('../services/gsmModemService');
const { getLatestState, executeAction: socketExecuteAction } = require('../sockets/gsmHandlers');

// GET /api/gsm/state
router.get('/state', (req, res) => {
  try {
    const state = gsmModemService.getStatus() || getLatestState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gsm/devices
router.get('/devices', async (req, res) => {
  try {
    const devices = await gsmModemService.getDevices();
    res.json(devices);
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
    try {
      result = await gsmModemService.executeAction(action, payload);
    } catch {
      result = await socketExecuteAction(action, payload);
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
