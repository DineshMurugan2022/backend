const { recordUserConnection, recordUserDisconnection } = require("../services/session");
const { connectedUsers } = require("./state");

module.exports = (io, socket) => {
    // Handle user activity updates
    socket.on('userActivity', (data) => {
        const { userId } = data;
        if (userId) {
            // Update last activity time
            recordUserConnection(userId, socket.id);
        }
    });

    // Handle user login
    socket.on('userLogin', (data) => {
        const { userId, username } = data;
        if (userId) {
            connectedUsers.set(userId, {
                socketId: socket.id,
                username,
                connectedAt: new Date()
            });

            // Record user connection
            recordUserConnection(userId, socket.id);

            // Notify others that user is online
            socket.broadcast.emit('userStatusChanged', { userId, status: 'active' });

            console.log(`👤 User ${username} (${userId}) logged in`);
        }
    });

    // Handle user logout
    socket.on('userLogout', (data) => {
        const { userId, username } = data;
        if (userId) {
            connectedUsers.delete(userId);

            // Record user disconnection
            recordUserDisconnection(userId);

            // Notify others that user is offline
            socket.broadcast.emit('userStatusChanged', { userId, status: 'inactive' });

            console.log(`👋 User ${username} (${userId}) logged out`);
        }
    });

    // Handle joining rooms
    socket.on('joinRoom', (roomName) => {
        socket.join(roomName);
        console.log(`🚪 Socket ${socket.id} joined room ${roomName}`);
    });

    // Handle joining user-specific room
    socket.on('joinUserRoom', (userId) => {
        if (userId) {
            socket.join(`user_${userId}`);
            console.log(`🚪 Socket ${socket.id} joined user room user_${userId}`);
        } else {
            console.log(`⚠️ joinUserRoom called without userId`);
        }
    });
};
