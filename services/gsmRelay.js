const crypto = require('node:crypto');

const offline = () => ({ connected: false, isHostOnline: false, call: 'idle', number: '', since: null,
  muted: false, audio: 'off', error: '', settings: null, diagnostics: {}, stats: {}, logs: [], history: [] });
const allowedActions = new Set(['connect', 'disconnect', 'dial', 'answer', 'hangup', 'mute', 'diagnostics', 'speaker-test', 'dtmf']);

// This registry deliberately has no shared/default modem. Run one backend instance.
class GsmRelay {
  constructor({ now = Date.now, saveCall = async () => {} } = {}) {
    this.now = now;
    this.saveCall = saveCall;
    this.pending = new Map();
    this.owners = new Map();
    this.agents = new Set();
  }
  attach(io) {
    const namespace = io.of('/gsm-agent');
    namespace.use((socket, next) => {
      const code = socket.handshake.auth?.pairingCode;
      if (!/^[A-F0-9]{24}$/.test(code || '')) return next(new Error('Invalid pairing code.'));
      next();
    });
    namespace.on('connection', socket => this.register(socket));
    const timer = setInterval(() => this.sweep(), 5000);
    timer.unref();
    return () => clearInterval(timer);
  }
  register(socket) {
    const code = socket.handshake.auth.pairingCode;
    if (this.pending.has(code)) return socket.disconnect(true);
    const host = { socket, code, expires: this.now() + 600000, state: offline(),
      devices: { ports: [], audio: [], audioError: '' }, owner: null, busy: false, saved: new Set(), saving: new Set() };
    this.agents.add(host);
    this.pending.set(code, host);
    socket.on('gsm:report', report => {
      if (!report || typeof report !== 'object') return;
      host.state = { ...offline(), ...report.state, isHostOnline: true };
      host.devices = { ports: Array.isArray(report.devices?.ports) ? report.devices.ports : [],
        audio: Array.isArray(report.devices?.audio) ? report.devices.audio : [], audioError: report.devices?.audioError || '' };
      this.persist(host);
    });
    socket.on('disconnect', () => {
      if (this.pending.get(code) === host) this.pending.delete(code);
      if (host.owner && this.owners.get(host.owner) === host) this.owners.delete(host.owner);
      this.agents.delete(host);
    });
  }
  persist(host) {
    if (!host.owner) return;
    for (const entry of (host.state.history || []).slice(0, 20)) {
      if (!entry.id || host.saved.has(entry.id) || host.saving.has(entry.id)) continue;
      host.saving.add(entry.id);
      Promise.resolve().then(() => this.saveCall(host.owner, entry)).then(() => host.saved.add(entry.id))
        .catch(error => console.error('GSM call log failed:', error.message)).finally(() => host.saving.delete(entry.id));
    }
  }
  pair(userId, rawCode) {
    const code = String(rawCode || '').replace(/[\s-]/g, '').toUpperCase();
    const host = this.pending.get(code);
    if (!host || host.expires < this.now() || !host.socket.connected) throw new Error('Pairing code is invalid or expired. Use the code currently shown on your PC.');
    if (this.owners.has(userId)) throw new Error('Unpair your current modem before pairing another PC.');
    this.pending.delete(code);
    host.owner = userId;
    host.lease = this.now() + 90000;
    this.owners.set(userId, host);
    host.socket.emit('gsm:paired');
    return this.state(userId);
  }
  host(userId) {
    const host = this.owners.get(userId);
    if (!host || !host.socket.connected) return null;
    if (host.lease < this.now()) { this.release(userId); return null; }
    return host;
  }
  state(userId) {
    const host = this.host(userId);
    if (!host) return offline();
    host.lease = this.now() + 90000;
    return { ...host.state, isHostOnline: true };
  }
  devices(userId) { return this.host(userId)?.devices || { ports: [], audio: [], audioError: '' }; }
  async action(userId, action, payload = {}) {
    if (!allowedActions.has(action)) throw new Error('Unknown modem action.');
    const host = this.host(userId);
    if (!host) throw new Error('Pair the modem on your PC first.');
    if (host.busy) throw new Error('A modem command is still running. Wait for it to finish.');
    host.busy = true;
    try {
      // Direct socket acknowledgement, not a broadcast acknowledgement array.
      return await new Promise((resolve, reject) => {
        host.socket.timeout(45000).emit('gsm:execute', { action, payload }, (error, result) => {
          if (error) return reject(new Error('Modem command timed out. Check its state before trying again.'));
          if (this.owners.get(userId) !== host) return reject(new Error('Modem pairing ended.'));
          if (result?.error) return reject(new Error(result.error));
          resolve(result?.state || result || {});
        });
      });
    } finally { host.busy = false; }
  }
  release(userId) {
    const host = this.owners.get(userId);
    if (!host) return;
    this.owners.delete(userId);
    // Keep owner attached to this retired host so its final call can still be logged.
    host.socket.emit('gsm:release');
  }
  sweep() {
    for (const [userId, host] of this.owners) if (host.lease < this.now()) this.release(userId);
    for (const [code, host] of this.pending) {
      if (host.expires < this.now()) { this.pending.delete(code); host.socket.emit('gsm:release'); }
    }
  }
}
const relay = new GsmRelay({ saveCall: async (userId, entry) => {
  const CallLog = require('../models/CallLog');
  const id = crypto.createHash('sha256').update(`${userId}:${entry.id}`).digest('hex').slice(0, 24);
  const duration = Math.max(0, Number(entry.duration) || 0);
  await CallLog.updateOne({ _id: id, userId }, { $setOnInsert: {
    phoneNumber: entry.number || 'Unknown', personName: entry.number || 'Unknown caller', companyName: 'GSM modem',
    callTime: new Date(entry.time), duration, direction: entry.direction === 'incoming' ? 'inbound' : 'outbound',
    status: entry.answered ? 'completed' : entry.direction === 'incoming' ? 'missed' : 'failed', userId
  } }, { upsert: true });
}});
module.exports = { relay, GsmRelay, offline };
