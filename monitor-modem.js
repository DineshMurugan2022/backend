const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function monitorModemResponses() {
  console.log('📡 Monitoring Huawei E173 responses...');
  
  try {
    const port = new SerialPort({
      path: 'COM5', // Use COM5 as detected by backend
      baudRate: 9600,
      autoOpen: false
    });
    
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    await new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) {
          console.error('❌ Failed to open port:', err.message);
          reject(err);
          return;
        }
        
        console.log('✅ Port opened, monitoring all responses...');
        
        // Monitor all responses
        parser.on('data', (data) => {
          console.log(`📡 RAW: ${data.trim()}`);
        });
        
        // Send test commands
        setTimeout(() => {
          console.log('📡 Sending: AT');
          port.write('AT\r');
        }, 1000);
        
        setTimeout(() => {
          console.log('📡 Sending: AT+CPIN?');
          port.write('AT+CPIN?\r');
        }, 2000);
        
        setTimeout(() => {
          console.log('📡 Making test call...');
          port.write('ATD+919843240703;\r');
        }, 3000);
        
        // Hang up after 8 seconds
        setTimeout(() => {
          console.log('📴 Hanging up...');
          port.write('ATH\r');
        }, 11000);
        
        // Close after 12 seconds
        setTimeout(() => {
          port.close();
          resolve();
        }, 15000);
      });
    });
    
    console.log('✅ Monitoring completed');
    
  } catch (err) {
    console.error('❌ Monitoring failed:', err.message);
  }
}

monitorModemResponses();
