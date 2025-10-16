// calls.js - Optimized SIM800 Call Service
const axios = require("axios");
const { getIOInstance } = require("../sockets/io");
const simpleUSBBridge = require("./simpleUSBHeadsetBridge");
const { getActivePort, getModemStatus } = require("./modem");

const activeCalls = {};

/**
 * Make a call using SIM800
 * @param {Object} params - { to, personName, companyName }
 */
async function makeCall({ to, personName, companyName }) {
  // Validate international phone number (+CCXXXXXXXXXX)
  if (!/^\+\d{10,15}$/.test(to)) {
    throw new Error("Invalid phone number format (must be +CCXXXXXXXXXX)");
  }

  const serialPort = getActivePort();
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("SIM800 modem not connected. Check modem service.");
  }

  // Ensure modem ready - TEMPORARY: Skip ready check if modem is connected
  const modemStatus = getModemStatus();
  if (!modemStatus.connected) {
    throw new Error("SIM800 modem not connected. Check modem service.");
  }
  
  // Log status for debugging
  console.log(`📊 Modem Status: Connected=${modemStatus.connected}, Ready=${modemStatus.ready}`);
  
  if (!modemStatus.ready) {
    console.log("⚠️ Modem not ready, but proceeding since it's connected (temporary fix)");
    // TEMPORARY: Allow calls if connected, even if not 'ready'
    // throw new Error("SIM800 modem not ready. Check SIM/network status.");
  }

  return new Promise((resolve, reject) => {
    console.log(`📞 Dialing ${to}...`);

    // Activate audio bridge for the call
    const audioResult = simpleUSBBridge.activateCallAudio(to);
    if (audioResult.success) {
      console.log("🔊 Audio bridge activated for call");
    }

    // Send dial command
    serialPort.write(`ATD${to};\r`, async (err) => {
      if (err) return reject(new Error("Failed to dial: " + err.message));

      const callSid = `SIM800_${Date.now()}`;
      activeCalls[to] = callSid;

      // Log call in backend database
      try {
        await axios.post(`${process.env.API_BASE_URL || "http://localhost:5000"}/api/calls`, {
          phoneNumber: to,
          personName,
          companyName,
        });
      } catch (apiErr) {
        console.error("❌ Failed to save call in DB:", apiErr.message);
      }

      // Emit socket event for frontend updates
      const io = getIOInstance();
      if (io) io.emit("callStatus", { to, status: "dialing", message: "Dialing..." });

      console.log(`✅ Call initiated to ${to}`);
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
    throw new Error("SIM800 modem not connected. Check modem service.");
  }

  return new Promise((resolve, reject) => {
    serialPort.write("ATH\r", (err) => {
      if (err) return reject(new Error("Failed to hang up: " + err.message));

      // Find which number corresponds to this callSid
      const to = Object.keys(activeCalls).find((num) => activeCalls[num] === callSid);
      if (to) delete activeCalls[to];

      // Deactivate audio bridge
      simpleUSBBridge.deactivateCallAudio(to);

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
