// modem.js - Optimized SIM800 Modem Service
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const COMMON_PORTS = [
  process.env.SIM800_PORT || "COM4",
  "COM3", "COM5", "COM6", "COM7", "COM8",
  "/dev/ttyUSB0", "/dev/ttyUSB1"
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
 * Auto-detect available SIM800 port
 */
async function findAvailablePort() {
  console.log("🔍 Searching for SIM800 ports...");
  for (const portPath of COMMON_PORTS) {
    const result = await tryConnectToPort(portPath);
    if (result.success) {
      console.log(`✅ Found SIM800 port: ${portPath}`);
      return portPath;
    } else {
      console.log(`❌ ${portPath} unavailable: ${result.error}`);
    }
  }
  console.log("❌ No available SIM800 ports found.");
  return null;
}

/**
 * Connect to SIM800 and start listening
 * @param {SocketIO.Server} io
 */
async function connectSIM800(io) {
  ioInstance = io;

  try {
    const availablePort = await findAvailablePort();
    if (!availablePort) {
      modemStatus = { connected: false, ready: false };
      emitStatus();
      return scheduleReconnect();
    }

    port = new SerialPort({ path: availablePort, baudRate: 9600, autoOpen: false });
    parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    port.open((err) => {
      if (err) {
        console.error("❌ Failed to open SIM800 port:", err.message);
        modemStatus = { connected: false, ready: false };
        emitStatus();
        return scheduleReconnect();
      }

      console.log(`✅ SIM800 connected on ${availablePort}`);
      modemStatus.connected = true;
      emitStatus();

      // Initialize modem with multiple AT commands
      setTimeout(() => {
        if (port && port.isOpen) {
          console.log("📡 Initializing SIM800 modem...");
          port.write("AT\r");  // Basic AT command
          setTimeout(() => {
            if (port && port.isOpen) {
              port.write("AT+CPIN?\r");  // Check SIM status
              setTimeout(() => {
                if (port && port.isOpen) {
                  port.write("AT+CREG?\r");  // Check network registration
                  // Set ready after initialization attempt
                  setTimeout(() => {
                    if (modemStatus.connected) {
                      modemStatus.ready = true;
                      emitStatus();
                      console.log("✅ SIM800 modem ready for calls");
                    }
                  }, 1000);
                }
              }, 500);
            }
          }, 500);
        }
      }, 1000);
    });

    parser.on("data", (line) => handleSerialData(line));
    port.on("close", () => handlePortClose());
    port.on("error", (err) => handlePortError(err));
  } catch (err) {
    console.error("❌ SIM800 exception:", err.message);
    modemStatus = { connected: false, ready: false };
    emitStatus();
    scheduleReconnect();
  }
}

/**
 * Handle serial data from SIM800
 * @param {string} line
 */
function handleSerialData(line) {
  console.log("📡 SIM800 >", line);

  // Handle OK responses - modem is responsive
  if (line.includes("OK")) {
    if (!modemStatus.ready) {
      modemStatus.ready = true;
      emitStatus();
      console.log("✅ SIM800 modem is ready");
    }
  } 
  
  // Handle ERROR responses
  if (line.includes("ERROR")) {
    console.warn("⚠️ SIM800 command error:", line);
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

  // Call status responses
  if (line.includes("CONNECT") || line.includes("VOICE CALL: BEGIN")) {
    if (ioInstance) ioInstance.emit("callStatus", { status: "connected", message: "Call connected" });
  }
  if (line.includes("BUSY")) {
    if (ioInstance) ioInstance.emit("callStatus", { status: "busy", message: "Number busy" });
  }
  if (line.includes("NO CARRIER") || line.includes("NO ANSWER")) {
    if (ioInstance) ioInstance.emit("callStatus", { status: "no_answer", message: "Call not answered" });
  }
  if (line.includes("NO DIALTONE")) {
    if (ioInstance) ioInstance.emit("callStatus", { status: "no_dialtone", message: "No dial tone" });
  }
}

/**
 * Handle port close
 */
function handlePortClose() {
  console.log("⚠️ SIM800 port closed");
  modemStatus = { connected: false, ready: false };
  emitStatus();
  scheduleReconnect();
}

/**
 * Handle port error
 * @param {Error} err
 */
function handlePortError(err) {
  console.error("❌ SIM800 port error:", err.message);
  modemStatus = { connected: false, ready: false };
  emitStatus();
  scheduleReconnect();
}

/**
 * Reconnect after delay
 */
function scheduleReconnect() {
  console.log("🔄 Reconnecting SIM800 in 5s...");
  setTimeout(() => connectSIM800(ioInstance), 5000);
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
  connectSIM800,
  getModemStatus,
  getActivePort,
};
