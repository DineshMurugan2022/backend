// Standalone test - initializes modem service first
const modem = require('./services/modem');
const mobilePartnerManager = require('./services/mobilePartnerManager');
const { SerialPort } = require('serialport');

async function standaloneTest() {
    console.log('='.repeat(50));
    console.log('Standalone Mobile Partner Test (COM12)');
    console.log('='.repeat(50));

    try {
        // Step 1: Ensure Mobile Partner is running
        console.log('\n1. Starting Mobile Partner...');
        await mobilePartnerManager.ensureRunning();
        console.log('✅ Mobile Partner is running');

        // Step 2: Connect to modem on COM12
        console.log('\n2. Connecting to modem on COM12...');
        const port = new SerialPort('COM12', { baudRate: 115200 });

        await new Promise((resolve, reject) => {
            port.on('open', () => {
                console.log('✅ Connected to modem on COM12');
                resolve();
            });
            port.on('error', reject);
        });

        // Step 3: Make test call
        const testNumber = '+919843240703'; // Replace with your number
        console.log(`\n3. Dialing ${testNumber}...`);

        await new Promise((resolve) => {
            port.write(`ATD${testNumber};\r`, () => {
                console.log('✅ Dial command sent');
                console.log('\n📱 Mobile Partner should now be handling the audio.');
                console.log('   Listen for the call ringing...');
                resolve();
            });
        });

        // Wait 10 seconds
        console.log('\n⏳ Waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Step 4: Hangup
        console.log('\n4. Hanging up...');
        await new Promise((resolve) => {
            port.write('ATH\r', () => {
                console.log('✅ Hangup command sent');
                resolve();
            });
        });

        // Close port
        port.close();

        console.log('\n' + '='.repeat(50));
        console.log('✅ Test completed successfully!');
        console.log('If you heard audio, the integration works!');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure the modem is plugged in');
        console.error('2. Check that Mobile Partner is installed');
        console.error('3. Modem is now on COM12/COM13 (updated)');
        console.error('4. Try closing any other programs using the modem');
    }

    process.exit(0);
}

// Run test
standaloneTest();
