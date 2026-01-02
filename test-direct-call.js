const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function makeDirectCall() {
  console.log('📞 Making direct call through Huawei E173...');
  
  try {
    const port = new SerialPort({
      path: 'COM6',
      baudRate: 9600,
      autoOpen: false
    });
    
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    await new Promise((resolve, reject) => {
      port.open(async (err) => {
        if (err) {
          console.error('❌ Failed to open port:', err.message);
          reject(err);
          return;
        }
        
        console.log('✅ Port opened, initializing modem...');
        
        // Initialize modem
        const initCommands = ['AT', 'AT+CPIN?', 'AT+CREG?'];
        
        for (let i = 0; i < initCommands.length; i++) {
          await new Promise(waitResolve => {
            setTimeout(() => {
              port.write(initCommands[i] + '\r');
              console.log(`📡 Sent: ${initCommands[i]}`);
              waitResolve();
            }, 1000);
          });
        }
        
        // Make test call
        setTimeout(() => {
          const phoneNumber = '+919843240703'; // Test number
          console.log(`📞 Calling ${phoneNumber}...`);
          port.write(`ATD${phoneNumber};\r`);
          
          // Listen for responses
          parser.on('data', (data) => {
            console.log(`📡 Received: ${data.trim()}`);
            
            if (data.includes('OK')) {
              console.log('✅ Call initiated successfully!');
            }
            if (data.includes('CONNECT')) {
              console.log('📞 Call connected!');
            }
            if (data.includes('BUSY')) {
              console.log('📞 Line busy');
            }
            if (data.includes('NO CARRIER')) {
              console.log('📞 Call ended');
            }
            if (data.includes('NO ANSWER')) {
              console.log('📞 No answer');
            }
          });
          
          // Hang up after 10 seconds
          setTimeout(() => {
            console.log('📴 Hanging up...');
            port.write('ATH\r');
            setTimeout(() => {
              port.close();
              resolve();
            }, 2000);
          }, 10000);
        }, 3000);
      });
    });
    
    console.log('✅ Direct call test completed');
    
  } catch (err) {
    console.error('❌ Direct call test failed:', err.message);
  }
}

makeDirectCall();
