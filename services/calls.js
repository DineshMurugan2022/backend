const axios = require("axios");
const { getIOInstance } = require("../sockets/io");
const audioBridge = require('./audioBridge');
const usbHeadsetBridge = require('./usbHeadsetBridge');
const simpleUSBBridge = require('./simpleUSBHeadsetBridge');

// Get the port instance from modem service

// Function to get the port from modem service
function getSerialPort() {
  const { getActivePort } = require('./modem');
  return getActivePort();
}

const activeCalls = {};

async function makeCall({ to, personName, companyName }) {
  if (!/^\+\d{10,15}$/.test(to)) throw new Error("Invalid phone number format (must be +CCXXXXXXXXXX)");

  const serialPort = getSerialPort();
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("SIM800 modem not connected. Check modem service.");
  }

  // Check SIM card and network status first
  console.log('🔍 Checking SIM card and network status...');
  
  // Send AT commands to check status
  return new Promise((resolve, reject) => {
    let statusChecks = 0;
    const maxChecks = 3;
    
    function checkSIMStatus() {
      statusChecks++;
      
      // Check SIM card PIN status
      serialPort.write("AT+CPIN?\r", (err) => {
        if (err) {
          console.error('❌ Failed to check SIM status:', err.message);
          if (statusChecks < maxChecks) {
            setTimeout(checkSIMStatus, 1000);
          } else {
            reject(new Error("Failed to check SIM card status"));
          }
          return;
        }
        
        // Wait a moment then check network registration
        setTimeout(() => {
          serialPort.write("AT+CREG?\r", (err) => {
            if (err) {
              console.error('❌ Failed to check network status:', err.message);
            }
            
            // Wait a moment then check signal strength
            setTimeout(() => {
              serialPort.write("AT+CSQ\r", (err) => {
                if (err) {
                  console.error('❌ Failed to check signal strength:', err.message);
                }
                
                // Now proceed with the call
                proceedWithCall();
              });
            }, 500);
          });
        }, 500);
      });
    }
    
    function proceedWithCall() {
      console.log(`📞 Attempting to dial ${to}...`);
      
      // Start simple USB headset bridge
      simpleUSBBridge.setupUSBHeadset().then((audioResult) => {
        console.log('🎧 Simple USB Bridge Result:', audioResult.success ? '✅ Ready' : '❌ Failed');
        
        // Send dial command
        serialPort.write(`ATD${to};\r`, async (err) => {
          if (err) return reject(new Error("❌ Failed to dial: " + err.message));

          const callSid = `SIM800_${Date.now()}`;
          activeCalls[to] = callSid;

          // Activate USB headset call audio
          simpleUSBBridge.setCallStatus(true, to);
          usbHeadsetBridge.setCallStatus(true, to);
          audioBridge.setCallStatus(true);

          try {
            await axios.post(`${process.env.API_BASE_URL || "http://localhost:5000"}/api/calls`, {
              phoneNumber: to,
              personName,
              companyName,
            });
          } catch (apiErr) {
            console.error("❌ Failed to save call to DB:", apiErr.message);
          }

          const io = getIOInstance();
          if (io) {
            io.emit("callStatus", { to, status: "dialing", message: "Dialing..." });
          }
          
          console.log(`📞 Call initiated to ${to}`);
          console.log('🔊 Waiting for SIM800 response...');
          console.log('📋 Expected responses: CONNECT, BUSY, NO CARRIER, NO ANSWER');
          
          resolve({ success: true, callSid });
        });
      }).catch((audioErr) => {
        console.error('❌ Audio bridge setup failed:', audioErr.message);
        // Continue with call even if audio bridge fails
        proceedWithCall();
      });
    }
    
    // Start the status checks
    checkSIMStatus();
  });
}

function hangupCall(callSid) {
  const serialPort = getSerialPort();
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("SIM800 modem not connected. Check modem service.");
  }

  return new Promise((resolve, reject) => {
    serialPort.write("ATH\r", (err) => {
      if (err) return reject(new Error("❌ Failed to hang up: " + err.message));
      
      const to = Object.keys(activeCalls).find((num) => activeCalls[num] === callSid);
      if (to) {
        delete activeCalls[to];
        
        // Deactivate call audio
        simpleUSBBridge.setCallStatus(false);
        usbHeadsetBridge.setCallStatus(false);
        audioBridge.setCallStatus(false);
        
        const io = getIOInstance();
        if (io) {
          io.emit("callEnded", { to });
        }
      }
      resolve({ success: true });
    });
  });
}

// Serial data handling is now managed by modem.js service
// The modem service will emit socket events for call status updates

module.exports = { makeCall, hangupCall };
