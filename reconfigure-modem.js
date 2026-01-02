const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

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

        // We use a one-time listener for the response
        const onData = (data) => {
            const s = data.toString().trim();
            if (s) console.log(`📡 Response: ${s}`);
            if (s.includes('OK') || s.includes('ERROR')) {
                clearTimeout(timeout);
                port.removeListener('data', onData);
                resolve(true);
            }
        };
        port.on('data', onData);
    });
}

async function fixModemComposition() {
    console.log(`🚀 Opening ${portPath} to reconfigure USB composition...`);
    const port = new SerialPort({ path: portPath, baudRate: 115200 });

    port.on('open', async () => {
        console.log(`✅ ${portPath} opened`);

        await sendCommand(port, 'AT');
        await sendCommand(port, 'AT^U2DIAG=256'); // Modem + Card Reader + Audio Interface

        console.log('\n✨ Command sent. The modem will now RESTART and RECONNECT.');
        console.log('📢 PLEASE WAIT 10 SECONDS, UNPLUG AND PLUG THE MODEM IF IT DOES NOT RECONNECT.');
        console.log('📢 THEN CHECK DEVICE MANAGER FOR "USB Audio Device".');

        setTimeout(() => {
            port.close();
            process.exit(0);
        }, 2000);
    });

    port.on('error', (err) => {
        console.log(`❌ SerialPort Error: ${err.message}`);
        if (err.message.includes('Access denied')) {
            console.log('📢 Hint: Make sure the backend server (node server.js) IS CLOSED before running this.');
        }
        process.exit(1);
    });
}

fixModemComposition().catch(console.error);
