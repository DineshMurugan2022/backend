const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

let modemPort = null;
let ioInstance = null;

function initSIM800(io, portPath = "/dev/ttyUSB0", baudRate = 9600) {
  ioInstance = io;

  modemPort = new SerialPort({ path: portPath, baudRate }, (err) => {
    if (err) {
      console.error("❌ SIM800 connection error:", err.message);
      emitStatus(false, false);
      return;
    }
    console.log(`📡 SIM800 connected on ${portPath} @ ${baudRate} baud`);
    emitStatus(true, false);
  });

  const parser = modemPort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

  parser.on("data", (line) => {
    console.log("📲 SIM800:", line);

    if (line.includes("Call Ready") || line.includes("SMS Ready")) {
      console.log("✅ SIM800 is ready to use!");
      emitStatus(true, true);
    }
  });

  modemPort.on("error", (err) => {
    console.error("❌ SIM800 error:", err.message);
    emitStatus(false, false);
  });

  modemPort.on("close", () => {
    console.log("🔌 SIM800 disconnected");
    emitStatus(false, false);
  });

  // Send AT to wake it up
  setTimeout(() => {
    if (modemPort?.writable) {
      modemPort.write("AT\r");
    }
  }, 2000);
}

function emitStatus(connected, ready) {
  if (ioInstance) {
    ioInstance.emit("modemStatus", { connected, ready });
  }
}

module.exports = { initSIM800 };
