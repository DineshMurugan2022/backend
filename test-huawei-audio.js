// test-huawei-audio.js - Test Huawei E173 audio routing
const huaweiE173Audio = require('./services/huaweiE173Audio');

async function testAudio() {
  console.log('🔊 Testing Huawei E173 Audio Routing...');
  console.log('=====================================');
  
  try {
    // Test audio bridge
    const result = await huaweiE173Audio.testBridge();
    console.log('📊 Audio Test Results:', result);
    
    // Activate audio for test call
    console.log('\n📞 Simulating call activation...');
    const activateResult = await huaweiE173Audio.activateCallAudio('+919843240703');
    console.log('🔊 Audio Activation Results:', activateResult);
    
    // Get status
    console.log('\n📈 Current Audio Status:');
    const status = huaweiE173Audio.getStatus();
    console.log(status);
    
    // Deactivate after test
    console.log('\n📴 Deactivating audio...');
    const deactivateResult = huaweiE173Audio.deactivateCallAudio('+919843240703');
    console.log('🔇 Audio Deactivation Results:', deactivateResult);
    
  } catch (error) {
    console.error('❌ Audio test failed:', error.message);
  }
}

testAudio();
