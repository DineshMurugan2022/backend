// calls.js - Optimized Huawei E173 Call Service with Mobile Partner Integration
const axios = require("axios");
const { getIOInstance } = require("../sockets/io");
const { getActivePort, getModemStatus } = require("./modem");
const CallLog = require("../models/CallLog");
const mobilePartnerManager = require("./mobilePartnerManager");

const activeCalls = {};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeWithDelay(serialPort, command, delayMs = 250) {
  return new Promise((resolve) => {
    serialPort.write(command, () => setTimeout(resolve, delayMs));
  });
}

async function preDialVoiceSetup(serialPort) {
  const cmds = [
    "AT^CVOICE=0\r",           // Use standard voice mode
    "AT^DDSETEX=2\r",          // Ensure PCM/USB routing
    "AT+CLVL=5\r",             // Set max speaker volume (0-5 based on probe)
    "AT+CMIC=0,10\r",          // Set mic gain
    "AT+CMUT=0\r",             // Ensure not muted
  ];

  for (const cmd of cmds) {
    await writeWithDelay(serialPort, cmd, 300);
  }
  await sleep(200);
}

/**
 * Make a call using Huawei E173
 * @param {Object} params - { to, personName, companyName }
 */
async function makeCall({ to, personName, companyName }) {
  // Validate international phone number (+CCXXXXXXXXXX)
  if (!/^\+\d{10,15}$/.test(to)) {
    throw new Error("Invalid phone number format (must be +CCXXXXXXXXXX)");
  }

  const serialPort = getActivePort();
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("Huawei E173 modem not connected. Check modem service.");
  }

  // Ensure modem ready - TEMPORARY: Skip ready check if modem is connected
  const modemStatus = getModemStatus();
  if (!modemStatus.connected) {
    throw new Error("Huawei E173 modem not connected. Check modem service.");
  }

  // Log status for debugging
  console.log(`📊 Modem Status: Connected=${modemStatus.connected}, Ready=${modemStatus.ready}`);

  if (!modemStatus.ready) {
    console.log("⚠️ Modem not ready, but proceeding since it's connected (temporary fix)");
    // TEMPORARY: Allow calls if connected, even if not 'ready'
    // throw new Error("Huawei E173 modem not ready. Check SIM/network status.");
  }

  console.log(`📞 Dialing ${to}...`);

  // Ensure Mobile Partner is running (handles audio)
  try {
    await mobilePartnerManager.ensureRunning();
    console.log("✅ Mobile Partner is running and will handle audio");
  } catch (err) {
    console.warn("⚠️ Failed to start Mobile Partner:", err.message);
    console.warn("   Audio may not work. Please start Mobile Partner manually.");
  }

  try {
    await preDialVoiceSetup(serialPort);
  } catch (err) {
    console.warn("⚠️ Pre-dial voice setup failed:", err.message);
  }

  return new Promise((resolve, reject) => {
    // Send dial command with proper voice call syntax
    serialPort.write(`ATD${to};\r`, (err) => {
      if (err) return reject(new Error("Failed to dial: " + err.message));

      const callSid = `HUAWEI_${Date.now()}`;
      activeCalls[to] = callSid;

      // Log call in backend database
      (async () => {
        try {
          const callLog = new CallLog({
            phoneNumber: to,
            personName,
            companyName,
            callTime: new Date(),
            status: 'initiated',
            duration: 0
          });
          await callLog.save();
          console.log("✅ Call logged to database");
        } catch (dbErr) {
          console.error("❌ Failed to save call in DB:", dbErr.message);
        }
      })();

      console.log(`✅ Real call initiated to ${to} via Huawei E173`);
      resolve({ success: true, callSid });
    });
  });
}

/**
 * Hang up an active call
 * @param {string} callSid - Call SID returned from makeCall
 */
async function hangupCall(callSid) {
  const serialPort = getActivePort();
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("Huawei E173 modem not connected. Check modem service.");
  }

  return new Promise((resolve, reject) => {
    serialPort.write("ATH\r", (err) => {
      if (err) return reject(new Error("Failed to hang up: " + err.message));

      // Find which number corresponds to this callSid
      const to = Object.keys(activeCalls).find((num) => activeCalls[num] === callSid);
      if (to) delete activeCalls[to];

      // Emit socket event
      const io = getIOInstance();
      if (io) io.emit("callEnded", { to });

      console.log(`📴 Call with ${to || "unknown"} ended`);
      resolve({ success: true });
    });
  });
}

/**
 * Check modem and SIM status
 * Can be used before dialing
 */
async function checkModemStatus() {
  const status = getModemStatus();
  return {
    connected: status.connected,
    ready: status.ready,
  };
}

module.exports = {
  makeCall,
  hangupCall,
  checkModemStatus,
};
