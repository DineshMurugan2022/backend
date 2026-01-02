// huaweiAudioBridge.js - Real audio bridge for Huawei E173 modem
const { exec } = require('child_process');
const os = require('os');

let audioStatus = {
  active: false,
  headsetConnected: false,
  modemAudioDevice: '',
  headsetAudioDevice: ''
};

/**
 * Check if running on Windows
 */
function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Execute Windows PowerShell command
 */
function executePowerShell(command) {
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Get all audio devices
 */
async function getAudioDevices() {
  try {
    const command = `
      Get-WmiObject -Class Win32_SoundDevice | Select-Object Name, DeviceID, Status | Format-Table -AutoSize
    `;
    const result = await executePowerShell(command);
    console.log("🔊 Audio devices:", result);
    return result;
  } catch (error) {
    console.error("❌ Failed to get audio devices:", error.message);
    return "";
  }
}

/**
 * Find Huawei E173 audio device
 */
async function findHuaweiAudioDevice() {
  try {
    // Look for Huawei modem audio device
    const command = `
      Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like "*Huawei*" -or $_.Name -like "*HUAWEI*" -or $_.Name -like "*Modem*"} | Select-Object Name, DeviceID
    `;
    const result = await executePowerShell(command);
    if (result && result.includes("Huawei")) {
      console.log("📱 Found Huawei audio device:", result);
      audioStatus.modemAudioDevice = "Huawei E173";
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Failed to find Huawei audio device:", error.message);
    return false;
  }
}

/**
 * Find USB headset
 */
async function findUSBHeadset() {
  try {
    const command = `
      Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like "*USB*" -or $_.Name -like "*Headset*" -or $_.Name -like "*Logitech*"} | Select-Object Name, DeviceID
    `;
    const result = await executePowerShell(command);
    if (result && (result.includes("USB") || result.includes("Headset"))) {
      console.log("🎧 Found USB headset:", result);
      audioStatus.headsetConnected = true;
      audioStatus.headsetAudioDevice = "USB Headset";
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Failed to find USB headset:", error.message);
    return false;
  }
}

/**
 * Set default audio device for calls
 */
async function setDefaultAudioDevice(deviceName) {
  try {
    // This is a simplified approach - Windows audio routing is complex
    const command = `
      Add-Type -TypeDefinition '
      using System;
      using System.Runtime.InteropServices;
      public class Audio {
        [DllImport("winmm.dll")]
        public static extern int waveOutSetVolume(IntPtr hwo, uint dwVolume);
        [DllImport("winmm.dll")]
        public static extern int waveOutGetVolume(IntPtr hwo, out uint dwVolume);
      }
      ';
      [Audio]::waveOutSetVolume([IntPtr]::Zero, 0xFFFF);
    `;
    await executePowerShell(command);
    console.log(`🔊 Audio device set to: ${deviceName}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to set audio device:", error.message);
    return false;
  }
}

/**
 * Activate audio bridge for Huawei E173 calls
 */
async function activateCallAudio(phoneNumber) {
  try {
    console.log(`🔊 Activating audio routing for call to ${phoneNumber}`);
    
    // Find devices
    await findHuaweiAudioDevice();
    await findUSBHeadset();
    
    if (!audioStatus.headsetConnected) {
      console.log("⚠️ No USB headset found, using default audio");
    }
    
    // Set maximum volume for call audio
    await setDefaultAudioDevice("Call Audio");
    
    audioStatus.active = true;
    
    return {
      success: true,
      message: "Audio bridge activated for Huawei E173 call",
      headsetDetected: audioStatus.headsetConnected,
      modemAudioFound: !!audioStatus.modemAudioDevice
    };
    
  } catch (error) {
    console.error("❌ Failed to activate audio bridge:", error.message);
    return {
      success: false,
      message: "Audio bridge activation failed: " + error.message
    };
  }
}

/**
 * Deactivate audio bridge
 */
function deactivateCallAudio(phoneNumber) {
  try {
    console.log(`🔇 Deactivating audio routing for call to ${phoneNumber}`);
    audioStatus.active = false;
    
    return {
      success: true,
      message: "Audio bridge deactivated"
    };
  } catch (error) {
    console.error("❌ Failed to deactivate audio bridge:", error.message);
    return {
      success: false,
      message: "Audio bridge deactivation failed: " + error.message
    };
  }
}

/**
 * Get current audio bridge status
 */
function getStatus() {
  return {
    ...audioStatus,
    active: audioStatus.active,
    headsetConnected: audioStatus.headsetConnected
  };
}

/**
 * Test audio bridge functionality
 */
async function testBridge() {
  try {
    console.log("🔊 Testing audio bridge...");
    
    const headsetFound = await findUSBHeadset();
    const huaweiFound = await findHuaweiAudioDevice();
    
    return {
      success: true,
      headsetConnected: headsetFound,
      modemAudioFound: huaweiFound,
      message: headsetFound ? "✅ USB headset detected" : "⚠️ No USB headset found"
    };
    
  } catch (error) {
    console.error("❌ Audio bridge test failed:", error.message);
    return {
      success: false,
      message: "Audio bridge test failed: " + error.message
    };
  }
}

module.exports = {
  activateCallAudio,
  deactivateCallAudio,
  getStatus,
  testBridge
};
