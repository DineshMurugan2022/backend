// Simple USB Headset Bridge - Direct Windows Audio Configuration
const { exec } = require('child_process');
const EventEmitter = require('events');

class SimpleUSBHeadsetBridge extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.headsetConnected = false;
    this.callActive = false;
    this.headsetInfo = null;
  }

  // Simple detection of USB audio devices
  async detectUSBHeadset() {
    console.log('🔍 Checking for USB Logitech headset...');
    
    return new Promise((resolve) => {
      // Simple PowerShell command to list audio devices
      const cmd = 'powershell "Get-CimInstance -ClassName Win32_SoundDevice | Where-Object {$_.Name -like \'*USB*\' -or $_.Name -like \'*Logitech*\'} | Select-Object Name"';
      
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          console.log('⚠️ Could not detect USB devices');
          resolve({ connected: false });
          return;
        }
        
        const hasUSBAudio = stdout.includes('USB') || stdout.includes('Logitech');
        
        if (hasUSBAudio) {
          console.log('✅ USB Logitech headset detected');
          this.headsetConnected = true;
          this.headsetInfo = { Name: 'USB Logitech Headset' };
          resolve({ connected: true, device: 'USB Logitech Headset' });
        } else {
          console.log('❌ No USB Logitech headset found');
          this.headsetConnected = false;
          resolve({ connected: false });
        }
      });
    });
  }

  // Simple setup that just opens Windows Sound settings
  async setupUSBHeadset() {
    console.log('🎧 Setting up USB Logitech headset...');
    
    try {
      // Step 1: Check if headset is connected
      const detection = await this.detectUSBHeadset();
      
      if (!detection.connected) {
        return {
          success: false,
          error: 'USB Logitech headset not detected',
          instructions: [
            'Plug in your USB Logitech headset',
            'Wait for Windows to install drivers',
            'Try setup again'
          ]
        };
      }

      // Step 2: Open Windows Sound Settings for user to configure manually
      console.log('📋 Opening Windows Sound Settings...');
      exec('start ms-settings:sound', (error) => {
        if (error) {
          console.log('⚠️ Could not open Sound Settings automatically');
        } else {
          console.log('✅ Windows Sound Settings opened');
        }
      });

      this.isActive = true;
      
      return {
        success: true,
        headsetDetected: true,
        headsetInfo: this.headsetInfo,
        requiresManualSetup: true,
        message: 'USB Logitech headset detected - manual Windows setup required',
        instructions: [
          'In Windows Sound Settings:',
          '1. Set USB Logitech Headset as DEFAULT output device',
          '2. Set USB Logitech Headset Microphone as DEFAULT input device', 
          '3. Test both devices using Windows test buttons',
          '4. Come back to CRM and test calls'
        ]
      };

    } catch (error) {
      console.error('❌ Setup error:', error);
      return {
        success: false,
        error: error.message,
        troubleshooting: [
          'Check USB headset connection',
          'Try different USB port',
          'Restart application',
          'Update headset drivers'
        ]
      };
    }
  }

  // Test if setup is working
  async testAudio() {
    console.log('🧪 Testing USB headset configuration...');
    
    const detection = await this.detectUSBHeadset();
    
    if (!detection.connected) {
      return {
        success: false,
        message: 'USB Logitech headset not detected',
        recommendations: ['Connect USB Logitech headset', 'Check Device Manager']
      };
    }

    // Simple test - just verify detection
    return {
      success: true,
      headsetDetected: true,
      message: 'USB Logitech headset detected and ready',
      instructions: [
        'Make a test call to verify audio',
        'Speak into headset microphone',
        'Listen through headset speakers',
        'Audio should flow automatically through Windows default devices'
      ]
    };
  }

  // Set call status
  setCallStatus(active, phoneNumber = null) {
    this.callActive = active;
    
    if (active) {
      console.log('\\n📞 CALL ACTIVE - USB LOGITECH HEADSET:');
      console.log('=====================================');
      console.log('🎧 Audio Setup:');
      console.log('   • USB SIM800: Call connection (COM5)');
      console.log('   • USB Logitech Headset: Voice audio');
      console.log('   • Windows: Automatic audio routing');
      console.log('');
      console.log('💬 During this call:');
      console.log('   ✓ Speak into USB Logitech headset microphone');
      console.log('   ✓ Listen through USB Logitech headset speakers');
      console.log('   ✓ Windows routes audio automatically');
      
      if (phoneNumber) {
        console.log(`📱 Calling: ${phoneNumber}`);
      }
      
      if (!this.headsetConnected) {
        console.log('⚠️  USB Logitech headset not detected!');
        console.log('   → Check headset connection');
        console.log('   → Run setup again');
      }
      
      console.log('=====================================\\n');
      
    } else {
      console.log('📴 Call ended - USB headset ready for next call');
    }
  }

  // Get current status
  getStatus() {
    return {
      bridgeActive: this.isActive,
      headsetConnected: this.headsetConnected,
      callActive: this.callActive,
      headsetInfo: this.headsetInfo,
      setupType: 'Simple Windows Audio Routing',
      instructions: {
        setup: 'Set USB Logitech headset as default in Windows Sound settings',
        usage: 'Windows automatically routes call audio through default devices',
        troubleshooting: 'Check Windows Sound settings if no audio during calls'
      }
    };
  }

  // Stop bridge
  async stopBridge() {
    console.log('🔇 Stopping USB headset bridge...');
    this.isActive = false;
    this.callActive = false;
    return { success: true, message: 'USB headset bridge stopped' };
  }
}

module.exports = new SimpleUSBHeadsetBridge();