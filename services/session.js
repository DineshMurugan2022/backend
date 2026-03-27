// backend/services/session.js
const User = require("../models/User");

// Store last location update time for each user
const lastLocationUpdate = new Map();

// Store connected users
const connectedUsers = new Map();

// Function to update user status based on last location update
async function updateUserStatus(userId) {
  try {
    // Check if user is currently connected via socket
    const isConnected = connectedUsers.has(userId);

    if (isConnected) {
      // For connected users, check location update time
      const lastUpdate = lastLocationUpdate.get(userId);
      if (!lastUpdate) {
        // If no location update but connected, mark as active
        await User.findByIdAndUpdate(userId, { loginStatus: 'active', lastUpdate: new Date() });
        return;
      }

      // If last update was within 5 minutes, mark as active, otherwise inactive
      const isActive = (Date.now() - lastUpdate) <= (5 * 60 * 1000); // 5 minutes
      const loginStatus = isActive ? 'active' : 'inactive';

      await User.findByIdAndUpdate(userId, { loginStatus, lastUpdate: new Date(lastUpdate) });

      // Emit status change to all clients
      const io = require('../sockets/io').getIOInstance();
      if (io) {
        try { io.emit('userStatusChanged', { userId, status: loginStatus }); } catch (e) { /* Redis may be down; ignore emit error */ }
      }
    } else {
      // For disconnected users, mark as inactive
      await User.findByIdAndUpdate(userId, { loginStatus: 'inactive' });

      // Emit status change to all clients
      const io = require('../sockets/io').getIOInstance();
      if (io) {
        try { io.emit('userStatusChanged', { userId, status: 'inactive' }); } catch (e) { /* Redis may be down; ignore emit error */ }
      }
    }
  } catch (error) {
    console.error('Error updating user status:', error);
  }
}

function handleTimeout() {
  console.log("⏰ Session timeout check triggered at", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));

  // Update status for all users based on last location update
  for (const userId of lastLocationUpdate.keys()) {
    updateUserStatus(userId);
  }

  // Also check connected users without location updates
  for (const userId of connectedUsers.keys()) {
    if (!lastLocationUpdate.has(userId)) {
      updateUserStatus(userId);
    }
  }
}

// Function to record location update with better error handling
function recordLocationUpdate(userId) {
  if (!userId) {
    console.warn('⚠️ Attempted to record location update without userId');
    return;
  }

  const updateTime = Date.now();
  lastLocationUpdate.set(userId, updateTime);
  console.log(`🕒 Recorded location update for user ${userId} at ${new Date(updateTime).toLocaleTimeString()}`);

  // Also update user status immediately
  updateUserStatus(userId);
}

// Function to record user connection
function recordUserConnection(userId, socketId) {
  if (!userId || !socketId) {
    console.warn('⚠️ Attempted to record user connection without userId or socketId');
    return;
  }

  connectedUsers.set(userId, {
    socketId,
    connectedAt: Date.now()
  });
  console.log(`🔗 Recorded user connection: ${userId} with socket ${socketId}`);

  // When user connects, mark them as active immediately
  updateUserStatus(userId);
}

// Function to record user disconnection
function recordUserDisconnection(userId) {
  if (!userId) {
    console.warn('⚠️ Attempted to record user disconnection without userId');
    return;
  }

  connectedUsers.delete(userId);
  console.log(`🚫 Recorded user disconnection: ${userId}`);

  // Update status immediately when user disconnects
  updateUserStatus(userId);
}

module.exports = {
  handleTimeout,
  recordLocationUpdate,
  recordUserConnection,
  recordUserDisconnection
};