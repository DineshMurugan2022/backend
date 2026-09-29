// gsmModemService.js
// Integrates Modem controller directly inside main Express/Socket.IO backend server.
// Eliminates the need for any separate modem server processes or batch files.

const path = require('path');
const { SerialPort } = require('serialport');

let Modem;
try {
  Modem = require('../../huawei-e173-test/lib/modem').Modem;
} catch {
  Modem = require('../services/modemLib').Modem;
}

class GsmModemService {
  constructor() {
    this.modem = new Modem();
    this.io = null;
    this.isInitialized = false;

    // Listen to modem state changes and broadcast via Socket.IO
    this.modem.on('state', (state) => {
      this.broadcastState(state);
    });
  }

  init(ioInstance) {
    this.io = ioInstance;
    this.isInitialized = true;
    console.log('📡 [GSM Modem Service] Integrated into backend server successfully');

    // Auto-detect connected Huawei COM ports on startup
    this.autoDetectPorts();
  }

  broadcastState(patch = {}) {
    if (this.io) {
      const fullState = this.getStatus();
      this.io.emit('gsm:state_changed', fullState);
    }
  }

  getStatus() {
    const snapshot = this.modem.snapshot();
    return {
      ...snapshot,
      isHostOnline: true, // Integrated into backend, so host is always online with backend
    };
  }

  async getDevices() {
    let ports = [];
    let audio = [];
    let audioError = '';

    try {
      ports = await SerialPort.list();
    } catch (err) {
      console.error('⚠️ [GSM Modem Service] Failed to list serial ports:', err.message);
    }

    try {
      audio = require('naudiodon').getDevices();
    } catch (err) {
      audioError = err.message;
    }

    return { ports, audio, audioError };
  }

  async autoDetectPorts() {
    try {
      const ports = await SerialPort.list();
      const huaweiPorts = ports.filter((p) => p.vendorId?.toLowerCase() === '12d1' || /huawei/i.test(p.friendlyName || ''));
      if (huaweiPorts.length > 0) {
        console.log(`🔌 [GSM Modem Service] Detected ${huaweiPorts.length} Huawei USB port(s):`, huaweiPorts.map(p => p.friendlyName || p.path).join(', '));
      }
    } catch {
      /* ignore */
    }
  }

  async executeAction(action, payload = {}) {
    const actions = {
      connect: () => this.modem.connect(payload),
      disconnect: () => this.modem.disconnect(),
      dial: () => this.modem.dial(payload.number),
      answer: () => this.modem.answer(),
      hangup: () => this.modem.hangup(),
      mute: () => this.modem.mute(payload.muted),
      diagnostics: () => this.modem.diagnose(),
    };

    if (!actions[action]) {
      throw new Error(`Unknown GSM action: ${action}`);
    }

    await actions[action]();
    return this.getStatus();
  }
}

const instance = new GsmModemService();
module.exports = instance;
