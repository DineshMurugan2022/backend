// modem.js - Optimized Huawei E173 GSM Modem Service
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const COMMON_PORTS = [
  "COM12", // Huawei E173 Application Interface (current)
  "COM13", // Huawei E173 PC UI Interface (current)
  "COM5",  // Huawei E173 Application Interface (fallback)
  "COM6",  // Huawei E173 PC UI Interface (fallback)
  "COM7",  // Alternative port
  process.env.HUAWEI_PORT || "COM12",
  "COM3", "COM4", "COM8", "COM9", "COM10",
  "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyACM0", "/dev/ttyACM1"
];

let port = null;
let parser = null;
let ioInstance = null;
let modemStatus = { connected: false, ready: false };

/**
 * Emit current modem status via Socket.IO
 */
function emitStatus() {
  if (ioInstance) {
    ioInstance.emit("modemStatus", modemStatus);
  }
}

/**
 * Try to connect to a given COM port
 * @param {string} portPath
 * @returns {Promise<{success: boolean, port?: string, error?: string}>}
 */
async function tryConnectToPort(portPath) {
  return new Promise((resolve) => {
    try {
      const testPort = new SerialPort({ path: portPath, baudRate: 9600, autoOpen: false });
      testPort.open((err) => {
        if (err) return resolve({ success: false, error: err.message });
        testPort.close();
        resolve({ success: true, port: portPath });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Auto-detect available Huawei E173 port
 */
async function findAvailablePort() {
  if (!modemStatus.hasWarnedNoPort) {
    console.log("🔍 Searching for Huawei E173 ports...");
  }

  const candidates = new Set(COMMON_PORTS.filter(Boolean));
  try {
    const ports = await SerialPort.list();
    console.log(`📋 System ports found: ${ports.map(p => p.path).join(', ')}`);
    for (const p of ports) {
      if (p && p.path) candidates.add(p.path);
    }
  } catch (err) {
    console.error("❌ Error listing serial ports:", err.message);
  }

  const probeVoicePort = (portPath) => {
    return new Promise((resolve) => {
      let testPort;
      try {
        testPort = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false });
      } catch (e) {
        return resolve({ success: false, error: e.message });
      }

      let stage = "AT";
      const finish = (result) => {
        try {
          if (testPort && testPort.isOpen) {
            return testPort.close(() => resolve(result));
          }
        } catch (e) {
        }
        resolve(result);
      };

      testPort.open((err) => {
        if (err) return finish({ success: false, error: err.message });

        const testParser = testPort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

        const timeout = setTimeout(() => {
          finish({ success: false, error: "timeout" });
        }, 2500);

        testParser.on("data", (line) => {
          const s = String(line || "").trim();
          if (!s) return;

          if (stage === "AT") {
            if (s === "OK") {
              stage = "CLCC";
              testPort.write("AT+CLCC\r");
            }
            return;
          }

          if (stage === "CLCC") {
            // Some modems return ERROR for AT+CLCC if no call is active, but they are still voice-capable
            if (s.includes("ERROR") || s.includes("+CLCC") || s === "OK") {
              clearTimeout(timeout);
              return finish({ success: true, port: portPath });
            }
          }
        });

        testPort.write("AT\r");
      });
    });
  };

  for (const portPath of candidates) {
    console.log(`🔎 Probing ${portPath} for voice call support (AT+CLCC?)...`);
    const result = await probeVoicePort(portPath);
    if (result.success) {
      console.log(`✅ Found Huawei voice/call-control port: ${portPath}`);
      return portPath;
    }
    console.log(`❌ ${portPath} not voice-capable: ${result.error}`);
  }

  if (!modemStatus.hasWarnedNoPort) {
    console.log("❌ No Huawei voice-capable ports found. Service will retry quietly in background.");
    modemStatus.hasWarnedNoPort = true;
  }
  return null;
}

/**
 * Connect to Huawei E173 and start listening
 * @param {SocketIO.Server} io
 */
async function connectHuaweiE173(io) {
  ioInstance = io;

  // Check if Modem is enabled via environment variable
  const isEnabled = process.env.ENABLE_MODEM === 'true';
  if (!isEnabled) {
    if (!modemStatus.loggedSkip) {
      console.log('ℹ️ Huawei E173 Modem Service is disabled via ENABLE_MODEM flag');
      modemStatus.loggedSkip = true;
    }
    return;
  }

  try {
    const availablePort = await findAvailablePort();
    if (!availablePort) {
      modemStatus = { ...modemStatus, connected: false, ready: false };
      emitStatus();
      return scheduleReconnect();
    }

    port = new SerialPort({ path: availablePort, baudRate: 115200, autoOpen: false });
    parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    port.open((err) => {
      if (err) {
        console.error("❌ Failed to open Huawei E173 port:", err.message);
        modemStatus = { connected: false, ready: false };
        emitStatus();
        return scheduleReconnect();
      }

      console.log(`✅ Huawei E173 connected on ${availablePort}`);
      modemStatus.connected = true;
      emitStatus();

      // Initialize modem with multiple AT commands for voice calls
      setTimeout(() => {
        if (port && port.isOpen) {
          console.log("📡 Initializing Huawei E173 modem for voice calls...");

          // Basic initialization sequence
          const initCommands = [
            "AT\r",                    // Basic AT test
            "AT+CPIN?\r",             // Check SIM status
            "AT+CREG?\r",             // Check network registration
            "AT+CLCC\r",              // Check call list
            "AT+CMGF=1\r",            // Set SMS mode (not needed for calls but good practice)
            "AT+CLIP=1\r",            // Enable caller ID
            "AT+COLP=1\r",            // Enable connected line identification
            "AT+CSCS=\"GSM\"\r",      // Set character set
            "AT^CVOICE=0\r",           // Set to standard voice mode (0 is standard, 1 is often data-voice)
            "AT^DDSETEX=2\r"           // Huawei audio routing profile (2=PCM/USB)
          ];

          let cmdIndex = 0;
          const sendNextCommand = () => {
            if (cmdIndex < initCommands.length && port && port.isOpen) {
              console.log(`📡 Sending: ${initCommands[cmdIndex].trim()}`);
              port.write(initCommands[cmdIndex]);
              cmdIndex++;
              setTimeout(sendNextCommand, 800); // Wait 800ms between commands
            } else if (cmdIndex >= initCommands.length) {
              // Initialization complete
              modemStatus.ready = true;
              emitStatus();
              console.log("✅ Huawei E173 modem fully initialized for voice calls");
            }
          };

          sendNextCommand();
        }
      }, 1500);
    });

    parser.on("data", (line) => handleSerialData(line));
    port.on("close", () => handlePortClose());
    port.on("error", (err) => handlePortError(err));
  } catch (err) {
    console.error("❌ Huawei E173 exception:", err.message);
    modemStatus = { connected: false, ready: false };
    emitStatus();
    scheduleReconnect();
  }
}

/**
 * Handle serial data from Huawei E173
 * @param {string} line
 */
function handleSerialData(line) {
  console.log("📡 Huawei E173 >", line); // This should show all responses

  // Handle OK responses - modem is responsive
  if (line.includes("OK")) {
    if (!modemStatus.ready) {
      modemStatus.ready = true;
      emitStatus();
      console.log("✅ Huawei E173 modem is ready");
    }
  }

  // Handle ERROR responses
  if (line.includes("ERROR")) {
    console.warn("⚠️ Huawei E173 command error:", line);
    // Don't set ready to false immediately for single errors
  }

  // SIM card status
  if (line.includes("+CPIN: READY")) {
    console.log("📱 SIM card ready");
    modemStatus.ready = true;
    emitStatus();
  }
  if (line.includes("+CPIN: SIM PIN")) {
    console.log("🔒 SIM PIN required");
    if (ioInstance) ioInstance.emit("simStatus", { status: "pin_required" });
  }

  // Network registration status
  if (line.match(/\+CREG: 0,[15]/)) {
    console.log("📶 Network registered");
    modemStatus.ready = true;
    emitStatus();
    if (ioInstance) ioInstance.emit("networkStatus", { status: "registered" });
  }
  if (line.match(/\+CREG: 0,[02]/)) {
    console.log("📶 Network not registered");
    if (ioInstance) ioInstance.emit("networkStatus", { status: "not_registered" });
  }

  // DEBUG: Log all lines that might be call-related
  if (line.includes("^") || line.includes("CONNECT") || line.includes("BUSY") ||
    line.includes("NO CARRIER") || line.includes("ORIG") || line.includes("CONF")) {
    console.log("🔍 DEBUG - Potential call response:", line);
  }

  // Huawei voice/audio mode responses (helps diagnose no-audio issues)
  if (line.includes("^CVOICE")) {
    if (ioInstance) ioInstance.emit("modemAudio", { key: "CVOICE", raw: line });
  }
  if (line.includes("^DDSETEX")) {
    if (ioInstance) ioInstance.emit("modemAudio", { key: "DDSETEX", raw: line });
  }

  // Call status responses - Real Huawei E173 responses
  if (line.includes("CONNECT") || line.includes("VOICE CALL: BEGIN") || line.includes("^CONN")) {
    console.log("📞 Call connected - Real modem response");
    if (ioInstance) ioInstance.emit("callStatus", { status: "connected", message: "Call connected" });
  }

  // Call originated/dialing responses
  if (line.includes("^ORIG") || (line.includes("OK") && line.includes("ATD"))) {
    console.log("📞 Call originated/dialing - Real modem response");
    if (ioInstance) ioInstance.emit("callStatus", { status: "dialing", message: "Dialing..." });
  }

  // Call confirmed responses
  if (line.includes("^CONF")) {
    console.log("📞 Call confirmed - Real modem response");
    if (ioInstance) ioInstance.emit("callStatus", { status: "ringing", message: "Call confirmed, ringing..." });
  }

  // Call busy responses
  if (line.includes("BUSY") || line.includes("+CME ERROR: 17")) {
    console.log("📞 Line busy - Real modem response");
    if (ioInstance) ioInstance.emit("callStatus", { status: "busy", message: "Line busy" });
  }

  // No answer responses
  if (line.includes("NO ANSWER") || line.includes("+CME ERROR: 18")) {
    console.log("📞 No answer - Real modem response");
    if (ioInstance) ioInstance.emit("callStatus", { status: "no_answer", message: "No answer" });
  }

  // Call ended responses
  if (line.includes("NO CARRIER") || line.includes("VOICE CALL: END") || line.includes("DISCONNECT") || line.includes("^CEND")) {
    console.log("📞 Call ended - Real modem response");
    if (ioInstance) ioInstance.emit("callEnded", { status: "ended", message: "Call ended" });
  }

  // Network error responses
  if (line.includes("+CME ERROR:")) {
    console.log("📞 Network error - Real modem response:", line);
    if (ioInstance) ioInstance.emit("callStatus", { status: "error", message: "Network error: " + line });
  }
  if (line.includes("NO DIALTONE")) {
    if (ioInstance) ioInstance.emit("callStatus", { status: "no_dialtone", message: "No dial tone" });
  }
}

/**
 * Handle port close
 */
function handlePortClose() {
  console.log("⚠️ Huawei E173 port closed");
  modemStatus = { connected: false, ready: false };
  emitStatus();
  scheduleReconnect();
}

/**
 * Handle port error
 * @param {Error} err
 */
function handlePortError(err) {
  console.error("❌ Huawei E173 port error:", err.message);
  modemStatus = { connected: false, ready: false };
  emitStatus();
  scheduleReconnect();
}

/**
 * Reconnect after delay
 */
function scheduleReconnect() {
  const retryTime = 60000; // 60 seconds
  if (!modemStatus.hasWarnedNoPort) {
    console.log(`🔄 Reconnecting Huawei E173 in ${retryTime / 1000}s...`);
  }
  setTimeout(() => connectHuaweiE173(ioInstance), retryTime);
}

/**
 * Get current modem status
 */
function getModemStatus() {
  return modemStatus;
}

/**
 * Get active port instance
 */
function getActivePort() {
  return port;
}

module.exports = {
  connectHuaweiE173,
  getModemStatus,
  getActivePort,
};
