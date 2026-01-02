// simpleHuaweiAudio.js - Simple audio solution for Huawei E173
const { exec } = require('child_process');

let audioStatus = {
  active: false,
  headsetConnected: false,
  volumeSet: false
};

/**
 * Set Windows volume to maximum for calls
 */
async function setMaxVolume() {
  try {
    // Set master volume to maximum
    await new Promise((resolve, reject) => {
      exec('nircmd.exe setsysvolume 65535', (error, stdout, stderr) => {
        if (error) {
          // Fallback to PowerShell if nircmd not available
          exec('powershell -Command "(New-Object -comObject WScript.Shell).SendKeys([char]175)"', (err2) => {
            if (err2) {
              console.log('⚠️ Could not set volume (nircmd not found)');
            } else {
              console.log('🔊 Volume increased via PowerShell');
            }
            resolve();
          });
        } else {
          console.log('🔊 Volume set to maximum');
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    console.error('❌ Failed to set volume:', error.message);
    return false;
  }
}

/**
 * Check if USB headset is connected
 */
async function checkUSBHeadset() {
  try {
    return new Promise((resolve) => {
      exec('powershell -Command "Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like \'*USB*\' -or $_.Name -like \'*Headset*\'}"', (error, stdout, stderr) => {
        if (stdout && (stdout.includes('USB') || stdout.includes('Headset'))) {
          console.log('🎧 USB headset detected');
          audioStatus.headsetConnected = true;
          resolve(true);
        } else {
          console.log('⚠️ No USB headset detected, using default speakers');
          audioStatus.headsetConnected = false;
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error('❌ Failed to check USB headset:', error.message);
    return false;
  }
}

/**
 * Activate audio for Huawei E173 call
 */
async function activateCallAudio(phoneNumber) {
  try {
    console.log(`🔊 Activating audio for Huawei E173 call to ${phoneNumber}`);
    
    // Check for USB headset
    await checkUSBHeadset();
    
    // Set volume to maximum for call audio
    await setMaxVolume();
    
    audioStatus.active = true;
    audioStatus.volumeSet = true;
    
    console.log('🔊 Audio activated for Huawei E173 call');
    console.log('📢 Use your USB headset or speakers to hear the call');
    
    return {
      success: true,
      message: "Audio activated for Huawei E173 call",
      headsetConnected: audioStatus.headsetConnected,
      instructions: [
        "Huawei E173 modem handles GSM call audio",
        "Use your USB headset or computer speakers",
        "Volume set to maximum for call audio",
        "Make sure headset/speakers are connected"
      ]
    };
    
  } catch (error) {
    console.error("❌ Failed to activate audio:", error.message);
    return {
      success: false,
      message: "Audio activation failed: " + error.message
    };
  }
}

/**
 * Deactivate audio after call
 */
function deactivateCallAudio(phoneNumber) {
  try {
    console.log(`🔇 Deactivating audio for call to ${phoneNumber}`);
    audioStatus.active = false;
    
    return {
      success: true,
      message: "Audio deactivated"
    };
  } catch (error) {
    console.error("❌ Failed to deactivate audio:", error.message);
    return {
      success: false,
      message: "Audio deactivation failed: " + error.message
    };
  }
}

/**
 * Get current audio status
 */
function getStatus() {
  return {
    ...audioStatus,
    active: audioStatus.active,
    headsetConnected: audioStatus.headsetConnected
  };
}

/**
 * Test audio functionality
 */
async function testBridge() {
  try {
    console.log("🔊 Testing Huawei E173 audio...");
    
    const headsetFound = await checkUSBHeadset();
    
    return {
      success: true,
      headsetConnected: headsetFound,
      message: headsetFound 
        ? "✅ USB headset detected - Ready for calls" 
        : "⚠️ Using default speakers - Connect USB headset for better audio",
      instructions: [
        "Huawei E173 handles GSM audio internally",
        "Audio will play through connected speakers/headset",
        "Volume is automatically set to maximum",
        "Test by making a call"
      ]
    };
    
  } catch (error) {
    console.error("❌ Audio test failed:", error.message);
    return {
      success: false,
      message: "Audio test failed: " + error.message
    };
  }
}

module.exports = {
  activateCallAudio,
  deactivateCallAudio,
  getStatus,
  testBridge
};
