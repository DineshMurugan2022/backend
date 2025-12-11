// Shared state for Socket.IO handlers

// Store connected users
const connectedUsers = new Map();

// Store active tracking sessions
const trackingSessions = new Map();

// Store for appointment update listeners
const appointmentListeners = new Set();

module.exports = {
  connectedUsers,
  trackingSessions,
  appointmentListeners
};
