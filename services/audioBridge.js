// audioBridge.js - Simple placeholder for audio bridge service

/**
 * Get current audio bridge status
 * @returns {Object} Status object
 */
function getStatus() {
  return {
    connected: false,
    active: false,
    message: "Audio bridge not implemented"
  };
}

/**
 * Start audio bridge
 * @returns {Object} Result object
 */
async function startAudioBridge() {
  return {
    success: false,
    message: "Audio bridge not implemented"
  };
}

module.exports = {
  getStatus,
  startAudioBridge
};
