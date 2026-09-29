// gsmModemService.js
// Integrates Modem controller directly inside main Express/Socket.IO backend server.
// Gracefully degrades on cloud/production environments (Render, Heroku, etc.)
// where no physical USB modem is attached.

const HARDWARE_UNAVAILABLE_STATE = {
  connected: false,
  call: 'idle',
  number: '',
  since: null,
  muted: false,
  audio: 'off',
  error: '',
  diagnostics: {},
  stats: {},
  settings: null,
  logs: [],
  history: [],
  isHostOnline: false, // No hardware modem on cloud server
};

// ── Try to load hardware-dependent modules ───────────────────────────────────
let Modem = null;
let SerialPort = null;
let hardwareAvailable = false;

try {
  // Try the local dev path first (huawei-e173-test next to backend)
  Modem = require('../../huawei-e173-test/lib/modem').Modem;
  hardwareAvailable = true;
} catch {
  // Local dev path not found — this is expected on Render/production
}

if (!hardwareAvailable) {
  try {
    // Try the bundled modemLib inside backend/services (optional local copy)
    Modem = require('./modemLib').Modem;
    hardwareAvailable = true;
  } catch {
    // Not found either — running on cloud with no modem support
  }
}

if (hardwareAvailable) {
  try {
    SerialPort = require('serialport').SerialPort;
  } catch {
    // serialport native module not built on this platform
    hardwareAvailable = false;
  }
}

if (!hardwareAvailable) {
  console.log('📡 [GSM Modem Service] Hardware modem not available on this platform — running in cloud/stub mode.');
}

// ── Stub class for cloud environments ─────────────────────────────────────────
class GsmModemServiceStub {
  init() {
    console.log('📡 [GSM Modem Service] Cloud stub active — modem features disabled on this server.');
  }
  getStatus() { return { ...HARDWARE_UNAVAILABLE_STATE }; }
  async getDevices() { return { ports: [], audio: [], audioError: 'No hardware modem available on this server.' }; }
  async executeAction() { throw new Error('GSM modem not available on this server. Use the local Start-GSM-Modem.bat instead.'); }
  broadcastState() {}
}

// ── Real class for local/Windows environments with USB modem ──────────────────
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

  broadcastState() {
    if (this.io) {
      this.io.emit('gsm:state_changed', this.getStatus());
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
      const huaweiPorts = ports.filter(
        (p) => p.vendorId?.toLowerCase() === '12d1' || /huawei/i.test(p.friendlyName || '')
      );
      if (huaweiPorts.length > 0) {
        console.log(
          `🔌 [GSM Modem Service] Detected ${huaweiPorts.length} Huawei USB port(s):`,
          huaweiPorts.map((p) => p.friendlyName || p.path).join(', ')
        );
      }
    } catch {
      /* ignore */
    }
  }

  async executeAction(action, payload = {}) {
    const actions = {
      connect:     () => this.modem.connect(payload),
      disconnect:  () => this.modem.disconnect(),
      dial:        () => this.modem.dial(payload.number),
      answer:      () => this.modem.answer(),
      hangup:      () => this.modem.hangup(),
      mute:        () => this.modem.mute(payload.muted),
      diagnostics: () => this.modem.diagnose(),
    };

    if (!actions[action]) {
      throw new Error(`Unknown GSM action: ${action}`);
    }

    await actions[action]();
    return this.getStatus();
  }
}

// Export the right implementation based on hardware availability
const instance = hardwareAvailable ? new GsmModemService() : new GsmModemServiceStub();
module.exports = instance;
