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
  let { phoneNumber, personName, companyName } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  const cleanPhone = String(phoneNumber).replace(/[^\d+]/g, '');
  if (cleanPhone.length < 2) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }
  req.body.phoneNumber = cleanPhone;
  if (!personName || !String(personName).trim()) {
    req.body.personName = cleanPhone;
  }
  if (!companyName || !String(companyName).trim()) {
    req.body.companyName = req.body.direction === 'inbound' ? 'Inbound Call' : 'General Call';
  }
  next();
};

// POST /api/calls - Add a new call log
router.post('/', auth, validateCallLog, async (req, res) => {
  try {
    const { phoneNumber, personName, companyName, direction, status, sid } = req.body;
    const callDir = direction || 'outbound';

    // Prevent duplicate entries if multiple systems (desktop PBX bridge, REST API) log simultaneously
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length >= 7) {
      const windowStart = new Date(Date.now() - 45 * 1000);
      const existingLog = await CallLog.findOne({
        userId: req.user._id,
        direction: callDir,
        callTime: { $gte: windowStart },
        phoneNumber: { $regex: cleanPhone + '$' }
      }).sort({ callTime: -1 });

      if (existingLog) {
        // If the new attempt is from the native PBX or has a SID, enrich the existing record
        if (companyName && !existingLog.companyName?.includes('PBX') && companyName.includes('PBX')) {
          existingLog.companyName = companyName;
        }
        if (sid && !existingLog.sid) existingLog.sid = sid;
        await existingLog.save();
        return res.status(200).json(existingLog);
      }
    }

    const log = new CallLog({
      phoneNumber,
      personName,
      companyName,
      callTime: new Date(),
      duration: 0,
      status: status || (callDir === 'inbound' ? 'ringing' : 'initiated'),
      direction: callDir,
      userId: req.user._id,
      sid: sid || undefined
    });
    await log.save();

    const io = getIOInstance();
    if (io) {
      // Emit to user's private room AND broadcast to all dashboards/admins
      io.to(`user_${req.user._id}`).emit('callLogAdded', { 
        logId: log._id,
        userId: req.user._id 
      });
      io.emit('callLogAdded', { 
        logId: log._id,
        userId: req.user._id 
      });
    }

    res.status(201).json(log);
  } catch (error) {
    console.error('Failed to log call:', error);
    res.status(500).json({ error: 'Failed to log call', details: error.message });
  }
});


/**
 * Deduplicate call logs that represent the same call.
 * A duplicate occurs when multiple systems (e.g. PBX desktop bridge and Web SIP/Click-to-Call)
 * logged the same event. We identify duplicates by:
 * - Same telecaller (userId)
 * - Same phone number (normalized)
 * - Same direction (inbound vs outbound)
 * - Timestamps within 60 seconds of each other
 * The entry with the highest duration (the answered call) is retained.
 */
function deduplicateCallLogs(logs) {
  if (!Array.isArray(logs) || logs.length <= 1) return logs || [];

  // Sort chronologically ascending for sliding window comparison
  const sorted = [...logs].sort((a, b) => new Date(a.callTime).getTime() - new Date(b.callTime).getTime());
  const kept = [];

  for (const log of sorted) {
    const uid = String(log.userId?._id || log.userId || '');
    const phone = String(log.phoneNumber || '').replace(/[^\d+]/g, '');
    const dir = String(log.direction || '');
    const logTime = new Date(log.callTime).getTime();

    // Look for an existing call matching same user + phone + direction within 60 seconds
    const matchIndex = kept.findIndex(existing => {
      const exUid = String(existing.userId?._id || existing.userId || '');
      const exPhone = String(existing.phoneNumber || '').replace(/[^\d+]/g, '');
      const exDir = String(existing.direction || '');
      const exTime = new Date(existing.callTime).getTime();
      return uid === exUid && phone === exPhone && dir === exDir && Math.abs(logTime - exTime) <= 60000;
    });

    if (matchIndex >= 0) {
      // Duplicate found — retain the one with higher duration (i.e. answered call)
      const existing = kept[matchIndex];
      const existingDur = Number(existing.duration) || 0;
      const logDur = Number(log.duration) || 0;
      if (logDur > existingDur) {
        kept[matchIndex] = log;
      }
    } else {
      kept.push(log);
    }
  }

  // Return sorted descending (newest first)
  return kept.sort((a, b) => new Date(b.callTime).getTime() - new Date(a.callTime).getTime());
}

// GET /api/calls/history-export - Full call history export with date and telecaller filters
// Access: admin, hr, teamleader, telecaller-tl
router.get('/history-export', auth, async (req, res) => {
  try {
    const privilegedRoles = ['admin', 'hr', 'teamleader', 'telecaller-tl'];
    const isPrivileged = privilegedRoles.includes(req.user.userGroup);

    const query = {};

    // If not privileged, restrict strictly to own calls
    if (!isPrivileged) {
      query.userId = req.user._id;
    } else if (req.query.userId && req.query.userId !== 'all') {
      query.userId = req.query.userId;
    }

    // Date filtering (supports single 'date' YYYY-MM-DD or startDate / endDate)
    if (req.query.date) {
      const dateStr = req.query.date.trim();
      const startOfDay = new Date(`${dateStr}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
      query.callTime = { $gte: startOfDay, $lte: endOfDay };
    } else if (req.query.startDate && req.query.endDate) {
      const startOfDay = new Date(`${req.query.startDate.trim()}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${req.query.endDate.trim()}T23:59:59.999+05:30`);
      query.callTime = { $gte: startOfDay, $lte: endOfDay };
    }

    if (req.query.direction && ['inbound', 'outbound'].includes(req.query.direction)) {
      query.direction = req.query.direction;
    }

    const rawLogs = await CallLog.find(query)
      .populate('userId', 'name email phone sipExtension userGroup')
      .sort({ callTime: -1 })
      .lean();

    const finalLogs = deduplicateCallLogs(rawLogs);

    res.json(finalLogs);
  } catch (error) {
    console.error('Failed to export call history:', error);
    res.status(500).json({ error: 'Failed to export call history', details: error.message });
  }
});

// GET /api/calls - Get all call logs, or filter by telecaller, phone, date
router.get('/', auth, async (req, res) => {
  try {
    const privilegedRoles = ['admin', 'hr', 'teamleader', 'telecaller-tl'];
    const isPrivileged = privilegedRoles.includes(req.user.userGroup);

    const query = {};
    if (!isPrivileged || req.query.self === 'true') {
      query.userId = req.user._id;
    } else if (req.query.userId && req.query.userId !== 'all') {
      query.userId = req.query.userId;
    }

    if (req.query.date) {
      const dateStr = req.query.date.trim();
      const startOfDay = new Date(`${dateStr}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
      query.callTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const phone = req.query?.phone;
    if (phone) {
      query.phoneNumber = phone;
    }
    const limit = parseInt(req.query?.limit, 10) || 50;
    const rawLogs = await CallLog.find(query)
      .populate('userId', 'name email phone sipExtension userGroup')
      .sort({ callTime: -1 })
      .limit(limit * 2)
      .lean();
    const finalLogs = deduplicateCallLogs(rawLogs).slice(0, limit);
    res.json(finalLogs);
  } catch (error) {
    console.error('Failed to fetch call logs:', error);
    res.status(500).json({ error: 'Failed to fetch call logs', details: error.message });
  }
});

// GET /api/calls/daily-stats - Get aggregated daily stats for monitoring dashboard
router.get('/daily-stats', auth, async (req, res) => {
  try {
    // Calculate start of day in Indian Standard Time (UTC+5:30)
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000; // 5.5 hours in ms
    const istDate = new Date(now.getTime() + istOffsetMs);
    const startOfIstDayInUtc = new Date(Date.UTC(
      istDate.getUTCFullYear(),
      istDate.getUTCMonth(),
      istDate.getUTCDate(),
      0, 0, 0, 0
    ) - istOffsetMs);

    // Fetch today's calls and deduplicate with the exact same algorithm as history-export
    const rawTodayLogs = await CallLog.find({
      callTime: { $gte: startOfIstDayInUtc },
      userId: { $ne: null }
    }).lean();

    const dedupedLogs = deduplicateCallLogs(rawTodayLogs);

    // Aggregate stats per user
    const statsMap = {};
    for (const log of dedupedLogs) {
      const uid = String(log.userId?._id || log.userId);
      if (!uid) continue;

      if (!statsMap[uid]) {
        statsMap[uid] = {
          userId: uid,
          totalCalls: 0,
          inboundCount: 0,
          outboundCount: 0,
          totalDuration: 0,
          avgDuration: 0
        };
      }

      statsMap[uid].totalCalls += 1;
      const dir = String(log.direction || 'outbound').toLowerCase();
      if (dir === 'inbound') {
        statsMap[uid].inboundCount += 1;
      } else {
        statsMap[uid].outboundCount += 1;
      }
      statsMap[uid].totalDuration += (Number(log.duration) || 0);
    }

    // Calculate avgDuration
    for (const uid of Object.keys(statsMap)) {
      const item = statsMap[uid];
      item.avgDuration = item.totalCalls > 0 ? Math.round(item.totalDuration / item.totalCalls) : 0;
    }

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

  const domain = normalizeSipDomain(firstNonEmpty(userSipDomain, getSipEnv('SIP_DOMAIN'), 'sip2.cloud-connect.in'));
  const registrar = normalizeSipDomain(firstNonEmpty(getSipEnv('SIP_REGISTRAR'), domain === 'sip2.cloud-connect.in' ? 'sip:sip2.cloud-connect.in:7065' : domain));
  const user = userSipUsername;
  const username = userSipUsername;
  const extension = userSipExtension;
  const password = userSipPassword;
  if (!username || !password || !extension) return res.status(409).json({ error: 'SIP credentials are not configured for this user' });
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
    let { duration, status, callStart, callEnd } = req.body;

    if (status === 'connected') status = 'in-progress';
    if (status === 'ended' || status === 'terminated') status = 'completed';

    const updateData = {};
    if ((callStart && !Number.isFinite(Date.parse(callStart))) || (callEnd && !Number.isFinite(Date.parse(callEnd))) || (callStart && callEnd && Date.parse(callEnd) < Date.parse(callStart))) return res.status(400).json({error: 'Invalid call timestamps'});
    if (status && !['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'missed', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({error: 'Invalid call status'});
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

    const query = { _id: id };
    if (req.user?.userGroup !== 'admin') {
      query.userId = req.user._id;
    }

    const log = await CallLog.findOneAndUpdate(
      query,
      updateData,
      { new: true, runValidators: true }
    );
    if (!log) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const io = getIOInstance();
    if (io) {
      if (log.userId) {
        io.to(`user_${log.userId}`).emit('callLogUpdated', { userId: log.userId, logId: log._id });
      }
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
    const log = await CallLog.findOneAndDelete({ _id: id, userId: req.user._id });
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

    const rawType = (event.event_type || event.type || event.status || event.call_status || '').toString().toLowerCase();
    const isIncoming = ['incoming_call', 'inbound_call', 'ringing', 'call_ringing', 'call_start'].includes(rawType);
    const isTerminated = ['call_hangup', 'hangup', 'call_ended', 'completed', 'missed', 'rejected', 'cancelled'].includes(rawType);
    const isAnswered = ['answered', 'call_answered', 'connected', 'in-progress'].includes(rawType);

    // Map CloudConnect extension/agent identifiers -> our User._id
    const extensionCandidate =
      (event.extension_number ?? event.extension ?? event.agent_extension ?? event.agent_id ?? event.callee_extension ?? '')
        .toString()
        .trim();

    let userId = null;
    let matchedUser = null;
    if (extensionCandidate) {
      matchedUser = await User.findOne({
        $or: [
          { sipExtension: extensionCandidate },
          { sipUsername: extensionCandidate }
        ]
      }).select('_id sipExtension sipUsername');
      if (matchedUser?._id) userId = matchedUser._id;
    }

    const callerNumber = (event.caller_number ?? event.caller ?? event.from ?? event.phone_number ?? event.src ?? 'Unknown').toString().trim();

    if (isIncoming) {
      const log = new CallLog({
        phoneNumber: callerNumber,
        personName: event.caller_name || callerNumber,
        companyName: 'CloudConnect Inbound',
        callTime: new Date(),
        duration: 0,
        direction: 'inbound',
        status: 'ringing',
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
      const statusPayload = {
        ...event,
        status: isTerminated ? 'ended' : (isAnswered ? 'answered' : (isIncoming ? 'ringing' : rawType)),
        phoneNumber: callerNumber,
        userId: userId
      };

      // Broadcast call status updates to all and user-targeted rooms
      io.emit('call:status', statusPayload);

      if (userId) {
        const targetRoom = `user_${userId.toString()}`;
        io.to(targetRoom).emit('callStatusUpdate', statusPayload);
        io.to(targetRoom).emit('call:status', statusPayload);
      } else if (extensionCandidate) {
        const legacyRoom = `user_${extensionCandidate}`;
        io.to(legacyRoom).emit('callStatusUpdate', statusPayload);
        io.to(legacyRoom).emit('call:status', statusPayload);
      }
    }
    res.json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
