const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function testHuaweiModem() {
  console.log('🔍 Testing Huawei E173 Modem Connection...');
  
  try {
    // Test common COM ports
    const testPorts = ['COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10'];
    let workingPort = null;
    
    for (const portName of testPorts) {
      try {
        console.log(`📡 Testing ${portName}...`);
        
        const port = new SerialPort({
          path: portName,
          baudRate: 9600,
          autoOpen: false
        });
        
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        
        await new Promise((resolve, reject) => {
          port.open((err) => {
            if (err) {
              console.log(`❌ ${portName}: ${err.message}`);
              resolve();
              return;
            }
            
            console.log(`✅ ${portName}: Port opened successfully`);
            
            // Send AT command
            setTimeout(() => {
              port.write('AT\r');
              console.log(`📡 Sent: AT`);
            }, 1000);
            
            // Listen for response
            let responseReceived = false;
            parser.on('data', (data) => {
              console.log(`📡 Received: ${data.trim()}`);
              if (data.includes('OK')) {
                console.log(`✅ ${portName}: Modem responded with OK!`);
                workingPort = portName;
                responseReceived = true;
              }
              if (responseReceived) {
                port.close();
                resolve();
              }
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
              if (!responseReceived) {
                console.log(`⏰ ${portName}: No response (timeout)`);
                port.close();
                resolve();
              }
            }, 5000);
          });
        });
        
        if (workingPort) break;
        
      } catch (err) {
        console.log(`❌ ${portName}: ${err.message}`);
      }
    }
    
    if (workingPort) {
      console.log(`\n🎉 SUCCESS! Huawei E173 found on ${workingPort}`);
      console.log(`\n📋 Next steps:`);
      console.log(`1. Set HUAWEI_PORT=${workingPort} in your environment`);
      console.log(`2. Start the backend server`);
      console.log(`3. Test making a call from the CRM`);
    } else {
      console.log(`\n❌ No working Huawei E173 modem found`);
      console.log(`\n🔧 Troubleshooting:`);
      console.log(`1. Check USB connection`);
      console.log(`2. Verify SIM card is inserted`);
      console.log(`3. Check Device Manager for COM ports`);
      console.log(`4. Try different USB ports`);
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testHuaweiModem();
