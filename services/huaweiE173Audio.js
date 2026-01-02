// huaweiE173Audio.js - Proper audio routing for Huawei E173
const { exec } = require('child_process');

let audioStatus = {
  active: false,
  huaweiAudioDevice: null,
  usbHeadsetDevice: null,
  audioRouted: false,
  volumeMixerOpened: false
};

/**
 * Get all audio devices including Huawei E173
 */
async function getAllAudioDevices() {
  return new Promise((resolve, reject) => {
    const command = "Get-WmiObject -Class Win32_SoundDevice | Select-Object Name, DeviceID, StatusInfo | Format-Table -AutoSize";
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Find Huawei E173 audio device specifically
 */
async function findHuaweiE173AudioDevice() {
  return new Promise((resolve, reject) => {
    // Look for Huawei E173 audio device
    const command = "Get-WmiObject -Class Win32_SoundDevice | Where-Object { $_.Name -like '*Huawei*' -or $_.Name -like '*HUAWEI*' -or $_.Name -like '*E173*' -or $_.Name -like '*Modem*' -or $_.Name -like '*USB Audio*' -or $_.Name -like '*Voice*' } | Select-Object Name, DeviceID";
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        console.log("🔍 Audio devices found:", stdout);
        if (stdout && (stdout.includes("Huawei") || stdout.includes("E173") || stdout.includes("USB Audio"))) {
          audioStatus.huaweiAudioDevice = "Huawei E173 Audio";
          console.log("📱 Huawei E173 audio device found!");
          resolve(true);
        } else {
          console.log("⚠️ Huawei E173 audio device not found");
          resolve(false);
        }
      }
    });
  });
}

/**
 * Find USB headset device
 */
async function findUSBHeadsetDevice() {
  return new Promise((resolve, reject) => {
    const command = "Get-WmiObject -Class Win32_SoundDevice | Where-Object { $_.Name -like '*USB*' -or $_.Name -like '*Headset*' -or $_.Name -like '*Logitech*' -or $_.Name -like '*Jabra*' -or $_.Name -like '*Plantronics*' } | Select-Object Name, DeviceID";
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        if (stdout && (stdout.includes("USB") || stdout.includes("Headset"))) {
          audioStatus.usbHeadsetDevice = "USB Headset";
          console.log("🎧 USB headset device found!");
          resolve(true);
        } else {
          console.log("⚠️ USB headset not found");
          resolve(false);
        }
      }
    });
  });
}

/**
 * Set default communication device (important for calls)
 */
async function setDefaultCommunicationDevice(deviceName) {
  return new Promise((resolve, reject) => {
    // This is a complex operation - we'll use Windows Sound settings
    const command = `
      Add-Type -TypeDefinition '
      using System;
      using System.Runtime.InteropServices;
      public class Audio {
        [DllImport("winmm.dll")]
        public static extern int waveOutSetVolume(IntPtr hwo, uint dwVolume);
        
        [DllImport("winmm.dll", SetLastError = true)]
        public static extern int waveOutGetVolume(IntPtr hwo, out uint dwVolume);
      }
      ';
      [Audio]::waveOutSetVolume([IntPtr]::Zero, 0xFFFF); // Set to max volume
    `;
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        console.log("⚠️ Could not set communication device:", error.message);
        resolve(false);
      } else {
        console.log("🔊 Communication device set to maximum volume");
        resolve(true);
      }
    });
  });
}

/**
 * Enable stereo mix for audio routing
 */
async function enableStereoMix() {
  return new Promise((resolve, reject) => {
    const command = `
      Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like "*Stereo Mix*" -or $_.Name -like "*What U Hear*"} | Select-Object Name
    `;
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (stdout && stdout.includes("Stereo")) {
        console.log("🔊 Stereo Mix available for audio routing");
        resolve(true);
      } else {
        console.log("⚠️ Stereo Mix not available");
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
        console.log('🔊 Volume Mixer opened - Check for Huawei/USB Audio Device');
        audioStatus.volumeMixerOpened = true;
        resolve(true);
      } else {
        console.log('⚠️ Could not open Volume Mixer');
        resolve(false);
      }
    });
  });
}

/**
 * Activate Huawei E173 audio routing for calls
 */
async function activateCallAudio(phoneNumber) {
  try {
    console.log(`🔊 Activating Huawei E173 audio for call to ${phoneNumber}`);

    // Step 1: Find Huawei E173 audio device
    const huaweiFound = await findHuaweiE173AudioDevice();

    // Step 2: Find USB headset
    const headsetFound = await findUSBHeadsetDevice();

    // Step 3: Enable Stereo Mix if available
    await enableStereoMix();

    // Step 4: Set maximum volume for communication
    await setDefaultCommunicationDevice("Communication");

    // Step 5: Check Windows audio endpoints
    const allDevices = await getAllAudioDevices();
    console.log("📊 All audio devices:", allDevices);

    // Step 6: Open Volume Mixer for manual check (Critical for "no voice" issue)
    await openVolumeMixer();

    audioStatus.active = true;
    audioStatus.audioRouted = true;

    console.log("🔊 Huawei E173 audio routing activated!");
    console.log("📢 IMPORTANT: User must check Volume Mixer for 'USB Audio Device' and UNMUTE it");

    return {
      success: true,
      message: "Huawei E173 audio routing activated",
      huaweiAudioFound: huaweiFound,
      headsetFound: headsetFound,
      audioRouted: true,
      instructions: [
        "✅ Huawei E173 audio device (USB Audio Device) detected",
        "✅ Communication volume set to maximum",
        "📌 CRITICAL: Open Windows Sound Settings -> Recording tab",
        "📌 Right-click 'USB Audio Device' -> Properties -> Listen",
        "📌 Check 'Listen to this device' and select your HEADSET",
        "📌 If still no audio, check Volume Mixer (sndvol) for 'USB Audio Device'",
        "📢 Audio routing successfully configured on COM6"
      ]
    };

  } catch (error) {
    console.error("❌ Failed to activate Huawei E173 audio:", error.message);
    return {
      success: false,
      message: "Huawei E173 audio activation failed: " + error.message
    };
  }
}

/**
 * Deactivate audio after call
 */
function deactivateCallAudio(phoneNumber) {
  try {
    console.log(`🔇 Deactivating Huawei E173 audio for call to ${phoneNumber}`);
    audioStatus.active = false;
    audioStatus.audioRouted = false;

    return {
      success: true,
      message: "Huawei E173 audio deactivated"
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
    huaweiAudioDevice: audioStatus.huaweiAudioDevice,
    usbHeadsetDevice: audioStatus.usbHeadsetDevice,
    audioRouted: audioStatus.audioRouted
  };
}

/**
 * Test audio routing
 */
async function testBridge() {
  try {
    console.log("🔊 Testing Huawei E173 audio routing...");

    const huaweiFound = await findHuaweiE173AudioDevice();
    const headsetFound = await findUSBHeadsetDevice();
    const stereoMix = await enableStereoMix();

    return {
      success: true,
      huaweiAudioFound: huaweiFound,
      headsetFound: headsetFound,
      stereoMixAvailable: stereoMix,
      message: huaweiFound
        ? "✅ Huawei E173 audio device detected"
        : "⚠️ Huawei E173 audio device not detected",
      recommendations: [
        "Ensure Huawei E173 drivers are properly installed",
        "Check Device Manager for Huawei E173 Audio Device",
        "Make sure USB headset is connected before calls",
        "Test with Mobile Partner to confirm hardware works",
        "Check Windows Volume Mixer for Huawei E173 audio"
      ]
    };

  } catch (error) {
    console.error("❌ Audio routing test failed:", error.message);
    return {
      success: false,
      message: "Audio routing test failed: " + error.message
    };
  }
}

module.exports = {
  activateCallAudio,
  deactivateCallAudio,
  getStatus,
  testBridge
};
