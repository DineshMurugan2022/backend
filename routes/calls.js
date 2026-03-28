const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const auth = require('../middleware/auth'); // Import auth middleware
const cloudConnect = require('../services/cloudConnect');
const { getIOInstance } = require('../sockets/io');
const User = require('../models/User');

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const getSipEnv = (key, fallback = '') => firstNonEmpty(
  process.env[key],
  process.env[`VITE_${key}`],
  fallback
);

const normalizeSipDomain = (value) => {
  const raw = firstNonEmpty(value);
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'cccpl' || lower === 'cloudconnect' || lower === 'cloud-connect') {
    return 'sip2.cloud-connect.in';
  }
  return raw;
};

// Middleware to validate request body
const validateCallLog = (req, res, next) => {
  const { phoneNumber, personName, companyName } = req.body;
  if (!phoneNumber || !personName || !companyName) {
    return res.status(400).json({ error: 'All fields (phoneNumber, personName, companyName) are required' });
  }
  // Point 6: Strengthen phone number regex validation
  if (!/^\+?\d{8,15}$/.test(phoneNumber.replace(/[^\d+]/g, ''))) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }
  next();
};

// POST /api/calls - Add a new call log
router.post('/', auth, validateCallLog, async (req, res) => {
  try {
    const { phoneNumber, personName, companyName, direction } = req.body;
    const log = new CallLog({
      phoneNumber,
      personName,
      companyName,
      callTime: new Date(),
      duration: 0,
      direction: direction || 'outbound',
      userId: req.user._id
    });
    await log.save();

    const io = getIOInstance();
    if (io) {
      // Point 4: Target specific user rooms
      io.to(`user_${req.user._id}`).emit('callLogAdded', { 
        logId: log._id 
      });
    }

    res.status(201).json(log);
  } catch (error) {
    console.error('Failed to log call:', error);
    res.status(500).json({ error: 'Failed to log call', details: error.message });
  }
});

// GET /api/calls - Get all call logs, or filter by phone
router.get('/', auth, async (req, res) => {
  try {
    // Point 7: Add User Filtering to Call Logs
    const query = { userId: req.user._id };
    const phone = req.query?.phone;
    if (phone) {
      query.phoneNumber = phone;
    }
    const logs = await CallLog.find(query).sort({ callTime: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch call logs:', error);
    res.status(500).json({ error: 'Failed to fetch call logs', details: error.message });
  }
});

// GET /api/calls/daily-stats - Get aggregated daily stats for monitoring dashboard
router.get('/daily-stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await CallLog.aggregate([
      {
        $match: {
          callTime: { $gte: today },
          userId: { $exists: true } // Point 11: Fix Daily Stats Filter
        }
      },
      {
        $group: {
          _id: "$userId",
          totalCalls: { $sum: 1 },
          inboundCount: {
            $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] }
          },
          outboundCount: {
            $sum: { $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0] }
          },
          totalDuration: { $sum: { $ifNull: ["$duration", 0] } }
        }
      },
      {
        $project: {
          userId: "$_id",
          totalCalls: 1,
          inboundCount: 1,
          outboundCount: 1,
          totalDuration: 1,
          avgDuration: {
            $cond: [
              { $eq: ["$totalCalls", 0] },
              0,
              { $round: [{ $divide: ["$totalDuration", "$totalCalls"] }, 0] }
            ]
          }
        }
      }
    ]);

    const statsMap = stats.reduce((acc, curr) => {
      acc[curr.userId.toString()] = curr;
      return acc;
    }, {});

    res.json(statsMap);
  } catch (error) {
    console.error('Failed to fetch daily call stats:', error);
    res.status(500).json({ error: 'Failed to fetch daily call stats', details: error.message });
  }
});

router.get('/sip-config', auth, (req, res) => {
  const userSipExtension = firstNonEmpty(req.user?.sipExtension?.toString());
  const userSipUsernameRaw = firstNonEmpty(req.user?.sipUsername?.toString());
  const userSipUsername = userSipUsernameRaw.includes('@')
    ? userSipUsernameRaw.split('@')[0]
    : userSipUsernameRaw;
  const userSipPassword = firstNonEmpty(req.user?.sipPassword?.toString());
  const userSipDomain = firstNonEmpty(req.user?.sipDomain?.toString());

  const domain = normalizeSipDomain(firstNonEmpty(userSipDomain, getSipEnv('SIP_DOMAIN', 'sip2.cloud-connect.in')));
  const registrar = normalizeSipDomain(firstNonEmpty(getSipEnv('SIP_REGISTRAR'), domain));
  const user = firstNonEmpty(userSipUsername, getSipEnv('SIP_USERNAME'), userSipExtension, getSipEnv('SIP_USER'));
  const username = firstNonEmpty(userSipUsername, getSipEnv('SIP_USERNAME'), user);
  const extension = firstNonEmpty(userSipExtension, getSipEnv('SIP_USER'), user);
  const password = firstNonEmpty(userSipPassword, getSipEnv('SIP_PASSWORD'));
  const wssUrl = firstNonEmpty(getSipEnv('SIP_WSS_URL'), domain ? `wss://${domain}:7443/` : '');

  res.json({
    user,
    username,
    domain,
    registrar,
    password,
    wssUrl,
    extension
  });
});

// PATCH /api/calls/:id - Update call log (e.g., duration after hang-up)
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, status, callStart, callEnd } = req.body; // Point 8: Duration Calculation

    const updateData = {};
    if (callStart) updateData.callStart = callStart;
    if (callEnd) updateData.callEnd = callEnd;

    if (duration !== undefined && !isNaN(duration) && duration >= 0) {
      updateData.duration = duration;
    } else if (callStart && callEnd) {
      // Auto-calculate duration if both timestamps exist
      const start = new Date(callStart);
      const end = new Date(callEnd);
      updateData.duration = Math.round((end - start) / 1000);
    }

    if (status) {
      updateData.status = status;
    }

    const log = await CallLog.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!log) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const io = getIOInstance();
    if (io && log.userId) {
      io.emit('callLogUpdated', { userId: log.userId, logId: log._id });
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

// --- CLOUDCONNECT SPECIFIC ROUTES ---

// POST /api/calls/click-to-call - Initiate Click-to-Call
router.post('/click-to-call', auth, async (req, res) => {
  try {
    const { phoneNumber, extensionNumber } = req.body;
    if (!phoneNumber || !extensionNumber) {
      return res.status(400).json({ error: 'phoneNumber and extensionNumber are required' });
    }
    // Point 9: Secure Click-to-Call (Don't allow password in body)
    const password = firstNonEmpty(
      req.user?.sipPassword?.toString(),
      getSipEnv('SIP_PASSWORD')
    );
    if (!password) {
      return res.status(500).json({ error: 'SIP password is not configured for click-to-call' });
    }
    const result = await cloudConnect.clickToCall(phoneNumber, extensionNumber, password);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Click-to-Call failed', details: error.message });
  }
});

// Point 3: Implement Inbound Call Logging in Webhook
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('🔔 CloudConnect Webhook Received:', event);
    
    const io = getIOInstance();
    if (!io) {
      console.error('⚠️ Webhook received but Socket.IO instance is not available');
    }

    if (event.event_type === 'incoming_call') {
      // Map CloudConnect extension/agent identifiers -> our User._id (rooms are keyed by Mongo _id)
      const extensionCandidate =
        (event.extension_number ?? event.extension ?? event.agent_extension ?? event.agent_id ?? '')
          .toString()
          .trim();

      let userId = null;
      if (extensionCandidate) {
        const user = await User.findOne({ sipExtension: extensionCandidate }).select('_id sipExtension');
        if (user?._id) userId = user._id;
      }

      const log = new CallLog({
        phoneNumber: event.caller_number,
        personName: event.caller_name || event.caller_number,
        companyName: 'CloudConnect Inbound',
        callTime: new Date(),
        duration: 0,
        direction: 'inbound',
        userId
      });
      await log.save();

      if (io) {
        const payload = {
          logId: log._id,
          phoneNumber: log.phoneNumber,
          personName: log.personName,
          companyName: log.companyName,
          callTime: log.callTime,
          direction: log.direction,
          status: 'ringing',
          userId: log.userId,
          raw: event
        };

        // 1) Global broadcast so all clients can choose to show popup
        io.emit('call:incoming', payload);

        // 2) Backward-compatible and targeted events if user is resolved
        if (log.userId) {
          const room = `user_${log.userId.toString()}`;
          io.to(room).emit('callLogAdded', { logId: log._id });
          io.to(room).emit('call:incoming', payload);
        }
      }
    }

    if (io) {
      io.emit('cloudConnectEvent', event); // Still broadcast for monitoring
      if (event.extension_number) {
        // Prefer user room by Mongo _id (sockets join user_<mongoId>), but keep legacy extension room too.
        const extension = event.extension_number.toString().trim();
        const user = extension
          ? await User.findOne({ sipExtension: extension }).select('_id sipExtension')
          : null;
        const targetRoom = user?._id ? `user_${user._id.toString()}` : `user_${extension}`;

        // 1) Global status update for any listeners
        io.emit('call:status', event);

        // 2) Targeted legacy + new events
        io.to(targetRoom).emit('callStatusUpdate', event);
        io.to(targetRoom).emit('call:status', event);
      }
    }
    res.json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
