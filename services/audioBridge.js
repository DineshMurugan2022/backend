// Audio Bridge Service for SIM800 and USB Headset
const { spawn } = require('child_process');
const path = require('path');

class AudioBridge {
  constructor() {
    this.isActive = false;
    this.audioProcess = null;
    this.callActive = false;
    this.usbHeadsetConnected = false;
  }

  async checkUSBHeadset() {
    try {
      // Check for USB audio devices
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('powershell "Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Name -like \'*USB*\' -or $_.Name -like \'*Logitech*\'} | Select-Object Name"', (error, stdout) => {
          if (error) {
            console.log('⚠️ Could not detect USB headset automatically');
            resolve(false);
          } else {
            const hasUSBHeadset = stdout.includes('USB') || stdout.includes('Logitech');
            this.usbHeadsetConnected = hasUSBHeadset;
            if (hasUSBHeadset) {
              console.log('✅ USB Headset detected');
            }
            resolve(hasUSBHeadset);
          }
        });
      });
    } catch (error) {
      console.log('⚠️ USB headset detection failed:', error.message);
      return false;
    }
  }

  async startAudioBridge() {
    if (this.isActive) {
      console.log('🎧 Audio bridge already active');
      return { success: true, message: 'Audio bridge already running' };
    }

    try {
      console.log('🎧 Starting audio bridge between SIM800 and USB headset...');
      
      // Check USB headset
      await this.checkUSBHeadset();
      
      console.log('\n📢 IMPORTANT: Audio Hardware Connection Required!');
      console.log('===============================================');
      console.log('🔌 Hardware Audio Bridge Setup:');
      console.log('1. You need a 3.5mm audio cable');
      console.log('2. Connect SIM800 audio output → Computer audio input (mic jack)');
      console.log('3. Computer audio output (headphone jack) → SIM800 audio input');
      console.log('4. OR use a USB-to-Audio adapter with audio cables');
      console.log('');
      console.log('🎧 Software Audio Setup:');
      console.log('1. Windows Sound Settings → Recording → Enable "Listen to this device"');
      console.log('2. Set USB headset as default playback device');
      console.log('3. Set USB headset microphone as default recording device');
      console.log('4. Enable microphone passthrough in Windows');
      console.log('');
      console.log('⚠️ Note: Without hardware audio cables, you can only use SIM800\'s built-in speaker/mic');
      console.log('===============================================\n');
      
      this.isActive = true;
      return { 
        success: true, 
        message: 'Audio bridge guidance provided',
        requiresHardware: true,
        instructions: {
          hardware: 'Connect 3.5mm audio cables between SIM800 and computer',
          software: 'Enable audio passthrough in Windows Sound settings',
          alternative: 'Use SIM800 built-in speaker/microphone if no cables available'
        }
      };
    } catch (error) {
      console.error('❌ Audio bridge error:', error);
      return { success: false, error: error.message };
    }
  }

  async stopAudioBridge() {
    if (!this.isActive) return;
    
    console.log('🔇 Stopping audio bridge...');
    
    if (this.audioProcess) {
      this.audioProcess.kill();
      this.audioProcess = null;
    }
    
    this.isActive = false;
    this.callActive = false;
  }

  setCallStatus(active) {
    this.callActive = active;
    if (active) {
      console.log('\n📞 CALL ACTIVE - Audio Instructions:');
      console.log('=====================================');
      console.log('🎧 If you have audio cables connected:');
      console.log('   - Speak into your USB headset microphone');
      console.log('   - Listen through USB headset speakers');
      console.log('   - Audio flows: Call ↔ SIM800 ↔ Computer ↔ USB Headset');
      console.log('');
      console.log('🔊 If NO audio cables (using SIM800 built-in):');
      console.log('   - Speak close to SIM800 module microphone');
      console.log('   - Listen to SIM800 module speaker');
      console.log('   - USB headset won\'t work without hardware connection');
      console.log('=====================================\n');
    } else {
      console.log('📴 Call ended - Audio bridge standby');
    }
  }

  getStatus() {
    return {
      bridgeActive: this.isActive,
      callActive: this.callActive,
      instructions: {
        setup: 'Set Logitech USB headset as default Windows audio device',
        microphone: 'Enable "Listen to this device" in microphone properties',
        speakers: 'Call audio will route through USB headset automatically'
      }
    };
  }

  // Windows-specific audio routing commands
  async configureWindowsAudio() {
    try {
      console.log('🔧 Configuring Windows audio routing...');
      
      // PowerShell commands to set audio device (requires user interaction)
      const commands = [
        'echo "Setting up audio routing for SIM800 + USB Headset"',
        'echo "Please manually set Logitech headset as default in Windows Sound settings"'
      ];
      
      for (const cmd of commands) {
        console.log(`Executing: ${cmd}`);
      }
      
      return { success: true, message: 'Audio configuration guidance provided' };
    } catch (error) {
      console.error('Audio configuration error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new AudioBridge();