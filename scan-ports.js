const { SerialPort } = require('serialport');

async function scanAllPorts() {
  console.log('🔍 Scanning all COM ports for Huawei E173...');
  
  const testPorts = ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10'];
  const baudRates = [9600, 115200, 57600, 38400];

  const testOne = (portName, baudRate) => {
    return new Promise((resolve) => {
      const { ReadlineParser } = require('@serialport/parser-readline');
      const port = new SerialPort({
        path: portName,
        baudRate: baudRate,
        autoOpen: false
      });

      port.open((err) => {
        if (err) {
          console.log(`❌ ${portName} @ ${baudRate}: ${err.message}`);
          return resolve(false);
        }

        console.log(`✅ ${portName} @ ${baudRate}: Port opened!`);

        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        let ok = false;

        parser.on('data', (data) => {
          const s = String(data || '').trim();
          if (!s) return;
          console.log(`📡 ${portName} @ ${baudRate} Received: ${s}`);
          if (s.includes('OK')) {
            console.log(`🎉 FOUND! Huawei E173 on ${portName} at ${baudRate} baud`);
            ok = true;
          }
        });

        setTimeout(() => {
          port.write('AT\r');
          console.log(`📡 Sent: AT to ${portName} @ ${baudRate}`);
        }, 500);

        setTimeout(() => {
          if (!ok) {
            console.log(`⏰ ${portName} @ ${baudRate}: No response`);
          }
          port.close(() => resolve(ok));
        }, 3000);
      });
    });
  };

  let found = false;
  
  for (const portName of testPorts) {
    for (const baudRate of baudRates) {
      try {
        console.log(`📡 Testing ${portName} at ${baudRate} baud...`);

        const ok = await testOne(portName, baudRate);
        if (ok) {
          found = true;
          break;
        }
        
      } catch (err) {
        console.log(`❌ ${portName} @ ${baudRate}: ${err.message}`);
      }
    }

    if (found) break;
  }
}

scanAllPorts();
