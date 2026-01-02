const { SerialPort } = require('serialport');

const portPath = 'COM6';

async function sendCommand(port, cmd) {
    return new Promise((resolve) => {
        console.log(`📡 Sending: ${cmd}`);
        port.write(`${cmd}\r`, (err) => {
            if (err) {
                console.log(`❌ Error sending ${cmd}: ${err.message}`);
                resolve(false);
            }
        });

        const timeout = setTimeout(() => {
            console.log(`❌ Timeout waiting for response to ${cmd}`);
            resolve(false);
        }, 2000);

        let response = '';
        const onData = (data) => {
            response += data.toString();
            if (response.includes('OK') || response.includes('ERROR')) {
                console.log(`📡 Response:\n${response.trim()}`);
                clearTimeout(timeout);
                port.removeListener('data', onData);
                resolve(response.trim());
            }
        };
        port.on('data', onData);
    });
}

async function probeModem() {
    console.log(`🚀 Probing ${portPath} for supported voice features...`);
    const port = new SerialPort({ path: portPath, baudRate: 115200 });

    port.on('open', async () => {
        console.log(`✅ ${portPath} opened`);

        await sendCommand(port, 'AT');
        await sendCommand(port, 'AT^CVOICE=?'); // Check supported voice modes
        await sendCommand(port, 'AT^CVOICE?');  // Check current voice mode
        await sendCommand(port, 'AT^U2DIAG=?'); // Check supported USB compositions
        await sendCommand(port, 'AT^U2DIAG?');  // Check current USB composition
        await sendCommand(port, 'AT^DDSETEX=?'); // Check supported audio routing profiles
        await sendCommand(port, 'AT+CLVL=?');   // Check supported volume range
        await sendCommand(port, 'AT+CMIC=?');   // Check supported mic gain range

        console.log('\n🏁 Probe complete.');

        setTimeout(() => {
            port.close();
            process.exit(0);
        }, 1000);
    });

    port.on('error', (err) => {
        console.log(`❌ SerialPort Error: ${err.message}`);
        process.exit(1);
    });
}

probeModem().catch(console.error);
