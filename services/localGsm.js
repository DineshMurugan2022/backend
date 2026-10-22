const { offline } = require('./gsmRelay');

// A modem plugged into this backend PC has exactly one authenticated owner.
class LocalGsm {
  constructor({ createModem, listPorts, audioDevices, selectPorts, saveCall = async () => {}, now = Date.now } = {}) {
    Object.assign(this, { createModem, listPorts, audioDevices, selectPorts, saveCall, now });
    this.owner = null;
    this.modem = null;
    this.available = false;
    this.busy = false;
    this.releasing = false;
    this.devicesCache = { ports: [], audio: [], audioError: '' };
    this.scanError = '';
    this.operation = Promise.resolve();
  }
  init() {
    if (!this.createModem && (process.platform !== 'win32' || process.env.ENABLE_MODEM === 'false')) {
      this.scanError = '';
      return;
    }
    try {
      if (!this.createModem) {
        const { Modem } = require('../../huawei-e173-test/lib/modem');
        const { SerialPort } = require('serialport');
        this.createModem = () => new Modem();
        this.listPorts = () => SerialPort.list();
        this.audioDevices = () => require('naudiodon').getDevices();
        this.selectPorts = require('../../huawei-e173-test/lib/ports').selectPorts;
      }
      this.available = true;
      this.scan();
      this.timer = setInterval(() => this.scan(), 3000);
      this.timer.unref();
    } catch (error) {
      this.scanError = 'USB modem support is unavailable. Run this backend on the Windows PC holding the modem and install its dependencies.';
      console.warn('GSM:', error.message);
    }
  }
  async scan() {
    if (!this.available || this.scanning) return;
    this.scanning = true;
    try {
      const ports = await this.listPorts();
      let audio = [], audioError = '';
      try { audio = this.audioDevices(); } catch (error) { audioError = error.message; }
      this.devicesCache = { ports, audio, audioError };
      this.scanError = '';
      if (this.modem?.retryHistory) this.modem.retryHistory();
      if (this.owner && (this.lease < this.now() || (this.modem?.settings &&
        (!ports.some(p => p.path === this.modem.settings.control) || !ports.some(p => p.path === this.modem.settings.voice))))) {
        await this.release(this.owner);
      }
    } catch (error) { this.scanError = error.message; }
    finally { this.scanning = false; }
  }
  state(userId) {
    if (this.owner === userId && !this.releasing && this.lease >= this.now()) {
      this.lease = this.now() + 90000;
      return { ...this.modem?.snapshot(), isHostOnline: this.available, owned: true, busy: false };
    }
    return { ...offline(), isHostOnline: this.available, busy: Boolean(this.owner), owned: false, error: this.scanError };
  }
  devices(userId) {
    if (this.owner && this.owner !== userId) return { ports: [], audio: [], audioError: '' };
    return this.devicesCache;
  }
  persist(modem, userId, saved, saving) {
    for (const entry of modem.history || []) {
      if (!entry.id || saved.has(entry.id) || saving.has(entry.id)) continue;
      saving.add(entry.id);
      Promise.resolve().then(() => this.saveCall(userId, entry)).then(() => saved.add(entry.id))
        .catch(error => console.error('GSM call log failed:', error.message)).finally(() => saving.delete(entry.id));
    }
  }
  async action(userId, action, payload = {}) {
    const actions = ['connect', 'disconnect', 'dial', 'answer', 'hangup', 'mute', 'diagnostics', 'speaker-test', 'dtmf'];
    if (!actions.includes(action)) throw new Error('Unknown modem action.');
    if (!this.available) throw new Error(this.scanError || 'Modem support is unavailable on this backend.');
    if (this.owner && this.owner !== userId) throw new Error('This modem is already connected to another user.');
    if (this.busy || this.releasing) throw new Error('A modem command is running. Please wait.');
    if (action === 'disconnect') { await this.release(userId); return this.state(userId); }
    if (action !== 'connect' && (!this.owner || this.lease < this.now())) throw new Error('Connect your modem first.');
    // Claim synchronously before any await, preventing two users racing to connect.
    if (action === 'connect' && !this.owner) {
      const modem = this.createModem();
      const saved = new Set(), saving = new Set();
      modem.retryHistory = () => this.persist(modem, userId, saved, saving);
      modem.on('state', modem.retryHistory);
      this.modem = modem;
      this.owner = userId;
    }
    this.lease = this.now() + 90000;
    this.busy = true;
    this.operation = (async () => {
      const modem = this.modem;
      const operations = {
        connect: async () => {
          if (modem.state.connected) return;
          const settings = this.selectPorts(await this.listPorts(), payload);
          await modem.connect(settings);
        },
        dial: () => modem.dial(payload.number), answer: () => modem.answer(), hangup: () => modem.hangup(),
        mute: () => modem.mute(payload.muted), diagnostics: () => modem.diagnose(),
        dtmf: () => {
          if (modem.state.call !== 'active' || !/^[0-9*#]$/.test(payload.digit || '')) throw new Error('DTMF needs an active call and one keypad digit.');
          return modem.command(`AT+VTS=${payload.digit}`);
        },
        'speaker-test': () => {
          if (modem.state.call !== 'idle') throw new Error('End the call before testing audio.');
          return require('../../huawei-e173-test/lib/voice').testSpeaker(payload.output, payload.playback);
        }
      };
      try {
        await operations[action]();
        return this.state(userId);
      } catch (error) {
        if (action === 'connect') {
          await modem.disconnect().catch(() => {});
          this.owner = null; this.modem = null;
        }
        throw error;
      }
    })();
    try { return await this.operation; }
    finally { this.busy = false; }
  }
  async release(userId) {
    if (!this.owner || this.owner !== userId) return;
    if (this.releasing) return this.releaseTask;
    this.releasing = true;
    this.releaseTask = (async () => {
      await this.operation.catch(() => {});
      try { await this.modem?.disconnect(); }
      finally { this.owner = null; this.modem = null; this.releasing = false; }
    })();
    return this.releaseTask;
  }
  async stop() { clearInterval(this.timer); if (this.owner) await this.release(this.owner); }
}
const { relay } = require('./gsmRelay');
const localGsm = new LocalGsm({ saveCall: relay.saveCall });
module.exports = { localGsm, LocalGsm };
