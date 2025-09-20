const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const { makeCall, hangupCall } = require('../services/calls');
const { getModemStatus } = require('../services/modem');
const { SerialPort } = require('serialport');
const audioBridge = require('../services/audioBridge');
const usbHeadsetBridge = require('../services/usbHeadsetBridge');
const simpleUSBBridge = require('../services/simpleUSBHeadsetBridge');

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
router.post('/', validateCallLog, async (req, res) => {
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
router.get('/', async (req, res) => {
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
router.patch('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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

// POST /api/calls/make - Make a call using SIM800
router.post('/make', async (req, res) => {
  try {
    const { phoneNumber, personName, companyName } = req.body;
    
    if (!phoneNumber || !personName || !companyName) {
      return res.status(400).json({ error: 'phoneNumber, personName, and companyName are required' });
    }
    
    if (!/^\+\d{10,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +12345678901)' });
    }
    
    const result = await makeCall({ 
      to: phoneNumber, 
      personName, 
      companyName 
    });
    
    res.json({ success: true, message: 'Call initiated successfully', callSid: result.callSid });
  } catch (error) {
    console.error('Failed to make call:', error);
    res.status(500).json({ error: 'Failed to make call', details: error.message });
  }
});

// POST /api/calls/hangup - Hang up a call
router.post('/hangup', async (req, res) => {
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
router.get('/modem-status', (req, res) => {
  const status = getModemStatus();
  res.json(status);
});

// GET /api/calls/test-ports - Test available COM ports
router.get('/test-ports', async (req, res) => {
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
router.post('/audio-notification', (req, res) => {
  try {
    const { phoneNumber, status, message } = req.body;
    
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

// GET /api/calls/audio-status - Get audio bridge status
router.get('/audio-status', (req, res) => {
  try {
    const status = audioBridge.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Audio status error:', error);
    res.status(500).json({ error: 'Failed to get audio status', details: error.message });
  }
});

// POST /api/calls/setup-audio - Setup audio bridge
router.post('/setup-audio', async (req, res) => {
  try {
    const result = await audioBridge.startAudioBridge();
    res.json(result);
  } catch (error) {
    console.error('Audio setup error:', error);
    res.status(500).json({ error: 'Failed to setup audio bridge', details: error.message });
  }
});

// POST /api/calls/setup-usb-headset - Setup USB headset bridge
router.post('/setup-usb-headset', async (req, res) => {
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
router.get('/usb-headset-status', async (req, res) => {
  try {
    const status = usbHeadsetBridge.getStatus();
    res.json(status);
  } catch (error) {
    console.error('USB headset status error:', error);
    res.status(500).json({ error: 'Failed to get USB headset status', details: error.message });
  }
});

// POST /api/calls/test-usb-audio - Test USB headset audio
router.post('/test-usb-audio', async (req, res) => {
  try {
    const testResults = await usbHeadsetBridge.testAudio();
    res.json(testResults);
  } catch (error) {
    console.error('USB audio test error:', error);
    res.status(500).json({ error: 'Failed to test USB audio', details: error.message });
  }
});

// POST /api/calls/setup-simple-usb - Simple USB headset setup
router.post('/setup-simple-usb', async (req, res) => {
  try {
    const result = await simpleUSBBridge.setupUSBHeadset();
    res.json(result);
  } catch (error) {
    console.error('Simple USB setup error:', error);
    res.status(500).json({ error: 'Failed to setup simple USB bridge', details: error.message });
  }
});

// GET /api/calls/simple-usb-status - Get simple USB bridge status
router.get('/simple-usb-status', async (req, res) => {
  try {
    const status = simpleUSBBridge.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Simple USB status error:', error);
    res.status(500).json({ error: 'Failed to get simple USB status', details: error.message });
  }
});

// POST /api/calls/test-simple-usb - Test simple USB setup
router.post('/test-simple-usb', async (req, res) => {
  try {
    const testResults = await simpleUSBBridge.testAudio();
    res.json(testResults);
  } catch (error) {
    console.error('Simple USB test error:', error);
    res.status(500).json({ error: 'Failed to test simple USB setup', details: error.message });
  }
});

module.exports = router;