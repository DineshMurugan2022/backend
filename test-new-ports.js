const { SerialPort } = require('serialport');

const testPorts = ['COM7', 'COM11'];

async function testPort(path) {
    return new Promise((resolve) => {
        console.log(`📡 Testing ${path}...`);
        const port = new SerialPort({ path, baudRate: 115200 });

        const timeout = setTimeout(() => {
            console.log(`❌ ${path}: Timeout (No response)`);
            port.close();
            resolve(false);
        }, 3000);

        port.on('open', () => {
            console.log(`✅ ${path}: Opened`);
            port.write('AT\r');
        });

        port.on('data', (data) => {
            const response = data.toString().trim();
            console.log(`📡 ${path} Response: ${response}`);
            if (response.includes('OK')) {
                clearTimeout(timeout);
                console.log(`✅ ${path}: This is a Command/Modem port.`);
                port.close();
                resolve(true);
            }
        });

        port.on('error', (err) => {
            console.log(`❌ ${path}: Error - ${err.message}`);
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

async function main() {
    for (const p of testPorts) {
        await testPort(p);
    }
}

main().catch(console.error);
