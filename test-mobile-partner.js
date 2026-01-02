// Test script for Mobile Partner integration
const callService = require('./services/calls');

async function testCall() {
    console.log('='.repeat(50));
    console.log('Testing Mobile Partner Integration');
    console.log('='.repeat(50));

    try {
        // Test call to a number (replace with your test number)
        const testNumber = '+919843240703'; // Replace with actual number

        console.log(`\n1. Making test call to ${testNumber}...`);

        const result = await callService.makeCall({
            to: testNumber,
            personName: 'Test Contact',
            companyName: 'Test Company'
        });

        console.log('\n✅ Call initiated successfully!');
        console.log('Call SID:', result.callSid);
        console.log('\n📱 Mobile Partner should now be handling the audio.');
        console.log('   You should hear the call ringing.');

        // Wait 10 seconds
        console.log('\n⏳ Waiting 10 seconds before hanging up...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Hangup
        console.log('\n2. Hanging up call...');
        await callService.hangupCall(result.callSid);

        console.log('\n✅ Call ended successfully!');
        console.log('\n' + '='.repeat(50));
        console.log('Test completed! If you heard audio, integration works!');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure the modem is plugged in');
        console.error('2. Check that Mobile Partner is installed');
        console.error('3. Verify COM port is correct (COM6)');
    }

    process.exit(0);
}

// Run test
testCall();
