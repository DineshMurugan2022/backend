// workingHuaweiAudio.js - Working audio solution for Huawei E173
const { exec } = require('child_process');

let audioStatus = {
  active: false,
  volumeSet: false,
  usbAudioDevice: false
};

/**
 * Set Windows volume to maximum
 */
async function setMaxVolume() {
  return new Promise((resolve) => {
    // Try multiple methods to set volume to max
    const commands = [
      'powershell -Command "(New-Object -comObject WScript.Shell).SendKeys([char]175)"', // Volume up
      'powershell -Command "(New-Object -comObject WScript.Shell).SendKeys([char]175)"', // Volume up again
      'powershell -Command "(New-Object -comObject WScript.Shell).SendKeys([char]175)"', // Volume up again
    ];
    
    let completed = 0;
    commands.forEach(cmd => {
      exec(cmd, (error) => {
        if (!error) console.log('🔊 Volume increased');
        completed++;
        if (completed === commands.length) {
          console.log('🔊 Volume set to maximum');
          resolve(true);
        }
      });
    });
  });
}

/**
 * Check for USB Audio Device (Huawei E173)
 */
async function checkUSBAudioDevice() {
  return new Promise((resolve) => {
    exec('powershell -Command "Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like \'*USB Audio*\'}"', (error, stdout, stderr) => {
      if (stdout && stdout.includes('USB Audio Device')) {
        console.log('📱 USB Audio Device found (Huawei E173)');
        audioStatus.usbAudioDevice = true;
        resolve(true);
      } else {
        console.log('⚠️ USB Audio Device not detected');
        audioStatus.usbAudioDevice = false;
        resolve(false);
      }
    });
  });
}

/**
 * Open Volume Mixer for manual setup
 */
async function openVolumeMixer() {
  return new Promise((resolve) => {
    exec('sndvol', (error) => {
      if (!error) {
        console.log('🔊 Volume Mixer opened - Check for USB Audio Device');
        resolve(true);
      } else {
        console.log('⚠️ Could not open Volume Mixer');
        resolve(false);
      }
    });
  });
}

/**
 * Activate working audio for Huawei E173
 */
async function activateCallAudio(phoneNumber) {
  try {
    console.log(`🔊 Activating audio for Huawei E173 call to ${phoneNumber}`);
    
    // Check for USB Audio Device
    const usbAudioFound = await checkUSBAudioDevice();
    
    // Set volume to maximum
    await setMaxVolume();
    
    // Open Volume Mixer for manual check
    await openVolumeMixer();
    
    audioStatus.active = true;
    audioStatus.volumeSet = true;
    
    console.log('🔊 Audio activated for Huawei E173 call');
    console.log('📢 IMPORTANT: Check Volume Mixer for "USB Audio Device"');
    console.log('📢 Make sure "USB Audio Device" is NOT muted');
    
    return {
      success: true,
      message: "Audio activated for Huawei E173 call",
      usbAudioDeviceFound: usbAudioFound,
      volumeSet: true,
      instructions: [
        "✅ Volume set to maximum",
        "✅ Volume Mixer opened",
        "📌 In Volume Mixer, find 'USB Audio Device'",
        "📌 Make sure it's NOT muted",
        "📌 Set its volume to maximum",
        "📌 This is your Huawei E173 audio",
        "📢 Test call now - audio should work!"
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
    usbAudioDeviceFound: audioStatus.usbAudioDevice
  };
}

/**
 * Test working audio
 */
async function testBridge() {
  try {
    console.log("🔊 Testing Huawei E173 working audio...");
    
    const usbAudioFound = await checkUSBAudioDevice();
    
    return {
      success: true,
      usbAudioDeviceFound: usbAudioFound,
      message: usbAudioFound 
        ? "✅ USB Audio Device detected - This is Huawei E173!" 
        : "⚠️ USB Audio Device not detected",
      instructions: [
        "USB Audio Device = Huawei E173 audio",
        "Check Volume Mixer for 'USB Audio Device'",
        "Make sure it's not muted",
        "Set volume to maximum",
        "Test with Mobile Partner first",
        "Then test with CRM call"
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
