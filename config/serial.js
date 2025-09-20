// This file is deprecated - serial port is now managed by services/modem.js
// The modem service automatically detects and connects to the correct COM port

// For backward compatibility, export a dummy object
module.exports = {
  isOpen: false,
  write: () => console.warn('⚠️ Use services/modem.js for serial communication'),
  on: () => console.warn('⚠️ Use services/modem.js for serial communication')
};