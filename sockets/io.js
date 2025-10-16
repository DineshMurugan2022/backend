// io.js
// Centralized Socket.IO instance management

let ioInstance = null;

/**
 * Set the Socket.IO instance (call this from your server setup)
 * @param {import("socket.io").Server} io
 */
function setIOInstance(io) {
  ioInstance = io;
  console.log("🔌 Socket.IO instance set successfully");
}

/**
 * Get the current Socket.IO instance
 * @returns {import("socket.io").Server | null}
 */
function getIOInstance() {
  if (!ioInstance) {
    console.warn("⚠️ Socket.IO instance requested but not initialized");
  }
  return ioInstance;
}

module.exports = {
  setIOInstance,
  getIOInstance,
};
