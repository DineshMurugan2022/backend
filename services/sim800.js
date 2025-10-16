// sim800.js - Optimized SIM800 Controller
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { getIOInstance } = require("../sockets/io");

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
 * Emit modem status via Socket.IO
 */
function emitStatus() {
  if (ioInstance) ioInstance.emit("modemStatus", modemStatus);
}

/**
 * Attempt connection to a port
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
 * Find an available SIM800 port
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
 * Connect to SIM800
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

      // Wake up modem
      port.write("AT\r");
    });

    parser.on("data", handleSerialData);
    port.on("close", handlePortClose);
    port.on("error", handlePortError);
  } catch (err) {
    console.error("❌ SIM800 exception:", err.message);
    modemStatus = { connected: false, ready: false };
    emitStatus();
    scheduleReconnect();
  }
}

/**
 * Handle incoming serial data
 */
function handleSerialData(line) {
  console.log("📡 SIM800 >", line);

  if (line.includes("OK")) {
    modemStatus.ready = true;
    emitStatus();
  } else if (line.includes("ERROR")) {
    modemStatus.ready = false;
    emitStatus();
  }

  // SIM card status
  if (line.includes("+CPIN: READY")) {
    console.log("📱 SIM card ready");
  }
  if (line.includes("+CPIN: SIM PIN")) {
    console.log("🔒 SIM PIN required");
    if (ioInstance) ioInstance.emit("simStatus", { status: "pin_required" });
  }

  // Network registration
  if (line.match(/\+CREG: 0,[15]/)) {
    console.log("📶 Network registered");
    if (ioInstance) ioInstance.emit("networkStatus", { status: "registered" });
  }
  if (line.match(/\+CREG: 0,[02]/)) {
    console.log("📶 Network not registered");
    if (ioInstance) ioInstance.emit("networkStatus", { status: "not_registered" });
  }

  // Call status events
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
 */
function handlePortError(err) {
  console.error("❌ SIM800 port error:", err.message);
  modemStatus = { connected: false, ready: false };
  emitStatus();
  scheduleReconnect();
}

/**
 * Reconnect after 5 seconds
 */
function scheduleReconnect() {
  console.log("🔄 Reconnecting SIM800 in 5s...");
  setTimeout(() => connectSIM800(ioInstance), 5000);
}

/**
 * Make a call
 */
function makeCall(number) {
  if (!port || !port.writable) {
    console.error("❌ Port not ready");
    return false;
  }
  port.write(`ATD${number};\r`);
  return true;
}

/**
 * Hang up a call
 */
function hangUp() {
  if (!port || !port.writable) {
    console.error("❌ Port not ready");
    return false;
  }
  port.write("ATH\r");
  return true;
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
  makeCall,
  hangUp,
};
