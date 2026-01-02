const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const portsToTest = ['COM5', 'COM6'];

async function testPort(path) {
    console.log(`\n🔎 Testing port: ${path}`);
    return new Promise((resolve) => {
        const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        const timeout = setTimeout(() => {
            console.log(`❌ Timeout on ${path}`);
            if (port.isOpen) port.close();
            resolve(false);
        }, 3000);

        port.open((err) => {
            if (err) {
                console.log(`❌ Error opening ${path}: ${err.message}`);
                clearTimeout(timeout);
                resolve(false);
                return;
            }

            console.log(`✅ Port ${path} opened successfully`);

            parser.on('data', (data) => {
                console.log(`📩 [${path}] response: ${data.trim()}`);
                if (data.includes('OK')) {
                    console.log(`✨ Got OK from ${path}! This port is responsive.`);
                    // Try voice capability check
                    if (!this.checkedVoice) {
                        this.checkedVoice = true;
                        port.write('AT+CLCC?\r');
                    }
                }
                if (data.includes('+CLCC') || data.includes('ERROR')) {
                    clearTimeout(timeout);
                    port.close(() => resolve(true));
                }
            });

            port.write('AT\r');
        });
    });
}

async function runDiagnostics() {
    console.log('🚀 Starting Huawei E173 Port Diagnostics...');
    for (const port of portsToTest) {
        await testPort(port);
    }
    console.log('\n🏁 Diagnostics complete.');
}

runDiagnostics().catch(console.error);
