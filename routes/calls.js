const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const { makeCall, hangupCall } = require('../services/calls');
const { getModemStatus } = require('../services/modem');
const { SerialPort } = require('serialport');
const audioBridge = require('../services/audioBridge');
const usbHeadsetBridge = require('../services/usbHeadsetBridge');
const huaweiAudioBridge = require("../services/huaweiAudioBridge");
const huaweiE173Audio = require("../services/huaweiE173Audio"); // Use specialized E173 audio service
const simpleUSBBridge = require("../services/simpleUSBHeadsetBridge"); // Fix reference error
const auth = require('../middleware/auth'); // Import auth middleware

// Middleware to validate request body
const validateCallLog = (req, res, next) => {
  const { phoneNumber, personName, companyName } = req.body;
  if (!phoneNumber || !personName || !companyName) {
    return res.status(400).json({ error: 'All fields (phoneNumber, personName, companyName) are required' });
  }
  if (!/^\+\d{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +12345678901)' });
  }
  next();
};

// POST /api/calls - Add a new call log
router.post('/', auth, validateCallLog, async (req, res) => {
  try {
    const { phoneNumber, personName, companyName } = req.body;
    const log = new CallLog({
      phoneNumber,
      personName,
      companyName,
      callTime: new Date(),
      duration: 0, // Initial duration, to be updated after call ends
    });
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    console.error('Failed to log call:', error);
    res.status(500).json({ error: 'Failed to log call', details: error.message });
  }
});

// GET /api/calls - Get all call logs, or filter by phone
router.get('/', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    let logs;
    if (phone) {
      logs = await CallLog.find({ phoneNumber: phone }).sort({ callTime: -1 });
    } else {
      logs = await CallLog.find().sort({ callTime: -1 });
    }
    if (!logs.length) {
      return res.status(404).json({ message: 'No call logs found' });
    }
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch call logs:', error);
    res.status(500).json({ error: 'Failed to fetch call logs', details: error.message });
  }
});

// PATCH /api/calls/:id - Update call log (e.g., duration after hang-up)
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.body;
    if (duration === undefined || isNaN(duration) || duration < 0) {
      return res.status(400).json({ error: 'Valid duration (in seconds) is required' });
    }
    const log = await CallLog.findByIdAndUpdate(
      id,
      { duration },
      { new: true, runValidators: true }
    );
    if (!log) {
      return res.status(404).json({ error: 'Call log not found' });
    }
    res.json(log);
  } catch (error) {
    console.error('Failed to update call log:', error);
    res.status(500).json({ error: 'Failed to update call log', details: error.message });
  }
});

// DELETE /api/calls/:id - Delete a call log
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const log = await CallLog.findByIdAndDelete(id);
    if (!log) {
      return res.status(404).json({ error: 'Call log not found' });
    }
    res.json({ message: 'Call log deleted successfully' });
  } catch (error) {
    console.error('Failed to delete call log:', error);
    res.status(500).json({ error: 'Failed to delete call log', details: error.message });
  }
});

// POST /api/calls/make - Make a call using Huawei E173 modem
router.post('/make', auth, async (req, res) => {
  try {
    const { phoneNumber, personName, companyName } = req.body;

    // Validate inputs
    if (!phoneNumber || !personName || !companyName) {
      return res.status(400).json({ error: 'phoneNumber, personName, and companyName are required' });
    }

    // Basic format check
    if (!/^\+\d{10,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +12345678901)' });
    }

    // Call Huawei Modem Service
    const result = await makeCall({ to: phoneNumber, personName, companyName });

    // Create Call Log in DB
    const log = new CallLog({
      phoneNumber,
      personName,
      companyName,
      callTime: new Date(),
      userId: req.user.id, // Track the user
      sid: result.callSid,
      status: 'initiated',
      duration: 0
    });

    await log.save();

    res.json({ success: true, message: 'Call initiated successfully through Huawei modem', callSid: result.callSid });
  } catch (error) {
    console.error('Failed to make call:', error);
    res.status(500).json({ error: 'Failed to make call', details: error.message });
  }
});

// POST /api/calls/hangup - Hang up a call
router.post('/hangup', auth, async (req, res) => {
  try {
    const { callSid } = req.body;

    if (!callSid) {
      return res.status(400).json({ error: 'callSid is required' });
    }

    await hangupCall(callSid);

    res.json({ success: true, message: 'Call hung up successfully' });
  } catch (error) {
    console.error('Failed to hang up call:', error);
    res.status(500).json({ error: 'Failed to hang up call', details: error.message });
  }
});

// GET /api/calls/modem-status - Get SIM800 modem status
router.get('/modem-status', auth, (req, res) => {
  const status = getModemStatus();
  res.json(status);
});

// GET /api/calls/test-ports - Test available COM ports
router.get('/test-ports', auth, async (req, res) => {
  try {
    const ports = await SerialPort.list();
    const availablePorts = ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || 'Unknown',
      vendorId: port.vendorId,
      productId: port.productId
    }));

    res.json({
      success: true,
      availablePorts,
      message: `Found ${availablePorts.length} serial ports`
    });
  } catch (error) {
    console.error('Failed to list ports:', error);
    res.status(500).json({ error: 'Failed to list serial ports', details: error.message });
  }
});

// POST /api/calls/audio-notification - Notify about call audio status
router.post('/audio-notification', auth, (req, res) => {
  try {
    // This endpoint can be used to trigger computer audio notifications
    // For example: "Call connected, use your USB headset for communication"

    res.json({
      success: true,
      message: 'Audio notification sent',
      audioInstructions: {
        usbHeadset: 'Connect Logitech USB headset to computer',
        sim800Audio: 'SIM800 handles GSM call audio',
        computerAudio: 'Use computer speakers/microphone for local audio',
        note: 'For full integration, consider hardware audio bridge solution'
      }
    });
  } catch (error) {
    console.error('Audio notification error:', error);
    res.status(500).json({ error: 'Failed to send audio notification', details: error.message });
  }
});

// --- HUAWEI SPECIFIC ROUTES (Matching Frontend Call.jsx) ---

// GET /api/calls/huawei-audio-status - Get Huawei audio status
router.get('/huawei-audio-status', auth, (req, res) => {
  try {
    const status = huaweiE173Audio.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Huawei audio status error:', error);
    res.status(500).json({ error: 'Failed to get Huawei audio status', details: error.message });
  }
});

// POST /api/calls/setup-huawei-audio - Setup Huawei audio routing
router.post('/setup-huawei-audio', auth, async (req, res) => {
  try {
    // Note: In some versions frontend might not pass phoneNumber here, using a dummy or latest if needed
    const result = await huaweiE173Audio.activateCallAudio(req.body.phoneNumber || "Current Call");
    res.json(result);
  } catch (error) {
    console.error('Huawei audio setup error:', error);
    res.status(500).json({ error: 'Failed to setup Huawei audio', details: error.message });
  }
});

// POST /api/calls/test-huawei-audio - Test Huawei audio bridge
router.post('/test-huawei-audio', auth, async (req, res) => {
  try {
    const result = await huaweiE173Audio.testBridge();
    res.json(result);
  } catch (error) {
    console.error('Huawei audio test error:', error);
    res.status(500).json({ error: 'Failed to test Huawei audio', details: error.message });
  }
});

// POST /api/calls/setup-usb-audio - Setup USB headset audio (called after makeCall)
router.post('/setup-usb-audio', auth, async (req, res) => {
  try {
    const result = await huaweiE173Audio.activateCallAudio("USB Audio Setup");
    res.json(result);
  } catch (error) {
    console.error('USB audio setup error:', error);
    res.status(500).json({ error: 'Failed to setup USB audio', details: error.message });
  }
});

// --- LEGACY/GENERAL ROUTES ---

// GET /api/calls/audio-status - Get audio bridge status
router.get('/audio-status', auth, (req, res) => {
  try {
    const status = audioBridge.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Audio status error:', error);
    res.status(500).json({ error: 'Failed to get audio status', details: error.message });
  }
});

// POST /api/calls/setup-audio - Setup audio bridge
router.post('/setup-audio', auth, async (req, res) => {
  try {
    const result = await audioBridge.startAudioBridge();
    res.json(result);
  } catch (error) {
    console.error('Audio setup error:', error);
    res.status(500).json({ error: 'Failed to setup audio bridge', details: error.message });
  }
});

// POST /api/calls/setup-usb-headset - Setup USB headset bridge
router.post('/setup-usb-headset', auth, async (req, res) => {
  try {
    const result = await usbHeadsetBridge.startAudioBridge();
    res.json({
      success: result.success,
      headsetInfo: result.headsetInfo,
      message: result.message,
      instructions: result.instructions,
      requiresManualSetup: result.requiresManualSetup
    });
  } catch (error) {
    console.error('USB headset setup error:', error);
    res.status(500).json({ error: 'Failed to setup USB headset', details: error.message });
  }
});

// GET /api/calls/usb-headset-status - Get USB headset status
router.get('/usb-headset-status', auth, async (req, res) => {
  try {
    const status = usbHeadsetBridge.getStatus();
    res.json(status);
  } catch (error) {
    console.error('USB headset status error:', error);
    res.status(500).json({ error: 'Failed to get USB headset status', details: error.message });
  }
});

// POST /api/calls/test-usb-audio - Test USB headset audio
router.post('/test-usb-audio', auth, async (req, res) => {
  try {
    const testResults = await usbHeadsetBridge.testAudio();
    res.json(testResults);
  } catch (error) {
    console.error('USB audio test error:', error);
    res.status(500).json({ error: 'Failed to test USB audio', details: error.message });
  }
});

// POST /api/calls/setup-simple-usb - Simple USB headset setup
router.post('/setup-simple-usb', auth, async (req, res) => {
  try {
    const result = await simpleUSBBridge.startBridge();
    res.json(result);
  } catch (error) {
    console.error('Simple USB setup error:', error);
    res.status(500).json({ error: 'Failed to setup simple USB bridge', details: error.message });
  }
});

// GET /api/calls/simple-usb-status - Get simple USB bridge status
router.get('/simple-usb-status', auth, async (req, res) => {
  try {
    const status = simpleUSBBridge.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Simple USB status error:', error);
    res.status(500).json({ error: 'Failed to get simple USB status', details: error.message });
  }
});

// POST /api/calls/test-simple-usb - Test simple USB setup
router.post('/test-simple-usb', auth, async (req, res) => {
  try {
    const testResults = await simpleUSBBridge.testBridge();
    res.json(testResults);
  } catch (error) {
    console.error('Simple USB test error:', error);
    res.status(500).json({ error: 'Failed to test simple USB setup', details: error.message });
  }
});

// POST /api/calls/test-ringtone - Test ringtone playback through USB headset
router.post('/test-ringtone', auth, async (req, res) => {
  try {
    simpleUSBBridge.testRingtone();
    res.json({
      success: true,
      message: 'Ringtone test started - should play for 5 seconds through USB headset'
    });
  } catch (error) {
    console.error('Ringtone test error:', error);
    res.status(500).json({ error: 'Failed to test ringtone', details: error.message });
  }
});

module.exports = router;