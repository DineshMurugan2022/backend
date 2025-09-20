const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

// List of common SIM800 COM ports to try
const COMMON_PORTS = [
  process.env.SIM800_PORT || "COM4",
  "COM3", "COM5", "COM6", "COM7", "COM8"
];

let port;
let parser;
let ioInstance;
let modemStatus = { connected: false, ready: false };

async function tryConnectToPort(portPath) {
  return new Promise((resolve) => {
    try {
      const testPort = new SerialPort({
        path: portPath,
        baudRate: 9600,
        autoOpen: false,
      });

      testPort.open((err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          testPort.close();
          resolve({ success: true, port: portPath });
        }
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

async function findAvailablePort() {
  console.log('🔍 Searching for available SIM800 ports...');
  
  for (const portPath of COMMON_PORTS) {
    console.log(`🔌 Trying port: ${portPath}`);
    const result = await tryConnectToPort(portPath);
    
    if (result.success) {
      console.log(`✅ Found available port: ${portPath}`);
      return portPath;
    } else {
      console.log(`❌ ${portPath}: ${result.error}`);
    }
  }
  
  console.log('❌ No available SIM800 ports found');
  return null;
}

function emitStatus() {
  if (ioInstance) {
    ioInstance.emit("modemStatus", modemStatus);
  }
}

async function connectSIM800(io) {
  ioInstance = io;

  try {
    // First try to find an available port
    const availablePort = await findAvailablePort();
    
    if (!availablePort) {
      console.error('❌ No available SIM800 ports found. Check connection and drivers.');
      modemStatus = { connected: false, ready: false };
      emitStatus();
      scheduleReconnect();
      return;
    }

    port = new SerialPort({
      path: availablePort,
      baudRate: 9600,
      autoOpen: false,
    });

    parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    port.open((err) => {
      if (err) {
        if (err.message.includes('Access denied')) {
          console.error('❌ SIM800 Access Denied - Port may be in use or requires admin rights');
          console.log('💡 Solutions:');
          console.log('   1. Close other apps using COM4 (Arduino IDE, PuTTY, etc.)');
          console.log('   2. Run Node.js/CMD as administrator');
          console.log('   3. Check if SIM800 is properly connected');
          console.log('   4. Try a different COM port');
        } else {
          console.error('❌ Failed to open SIM800 port:', err.message);
        }
        modemStatus = { connected: false, ready: false };
        emitStatus();
        scheduleReconnect();
        return;
      }

      console.log("✅ SIM800 Port Opened:", port.path);
      modemStatus.connected = true;
      emitStatus();

      // Send AT to check modem
      port.write("AT\r");
    });

    parser.on("data", (line) => {
      console.log("📡 SIM800 >", line);

      if (line.includes("OK")) {
        modemStatus.ready = true;
        emitStatus();
      }

      if (line.includes("ERROR")) {
        modemStatus.ready = false;
        emitStatus();
      }
    });

    port.on("close", () => {
      console.log("⚠️ SIM800 Port Closed");
      modemStatus = { connected: false, ready: false };
      emitStatus();
      scheduleReconnect();
    });

    port.on("error", (err) => {
      console.error("❌ SIM800 Error:", err.message);
      modemStatus = { connected: false, ready: false };
      emitStatus();
      scheduleReconnect();
    });
  } catch (err) {
    console.error("SIM800 Exception:", err.message);
    modemStatus = { connected: false, ready: false };
    emitStatus();
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  console.log("🔄 Reconnecting to SIM800 in 5s...");
  setTimeout(() => connectSIM800(ioInstance), 5000);
}

function getModemStatus() {
  return modemStatus;
}

function getActivePort() {
  return port;
}

module.exports = { connectSIM800, getModemStatus, getActivePort };
