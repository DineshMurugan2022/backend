const { setIOInstance } = require("./io");
const { recordUserConnection, recordUserDisconnection } = require("../services/session");
const { connectedUsers, trackingSessions, appointmentListeners } = require("./state");

const registerUserHandlers = require("./userHandlers");
const registerMessageHandlers = require("./messageHandlers");
const registerLocationHandlers = require("./locationHandlers");
const registerAppointmentHandlers = require("./appointmentHandlers");
const registerChatHandlers = require("./chatHandlers");

const setupSocketIO = (io) => {
    setIOInstance(io);

    // Global error wrapper for all socket events
    const safeHandler = (handler) => async (...args) => {
        try {
            await handler(...args);
        } catch (err) {
            console.error('🔥 Socket Event Error:', err.message);
            // Optionally notify the client of the error
        }
    };

    // Enhanced connection handler with better error handling
    io.on("connection", (socket) => {
        console.log(`🔌 New socket connection: ${socket.id}`);

        // Add socket to appointment listeners
        appointmentListeners.add(socket);

        // Extract user ID from handshake
        const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

        if (userId) {
            // Join user-specific room
            socket.join(`user_${userId}`);
            console.log(`🔗 Socket ${socket.id} joined room user_${userId} (auto-join on connection)`);

            // Track connected user
            connectedUsers.set(userId, {
                socketId: socket.id,
                connectedAt: new Date()
            });

            // Record user connection
            recordUserConnection(userId, socket.id);

            // Notify others that user is online
            try { socket.broadcast.emit('userStatusChanged', { userId, status: 'active' }); } catch (e) { /* Redis may be down */ }
        } else {
            console.log(`⚠️ Socket ${socket.id} connected without userId`);
        }

        // Register all handlers
        registerUserHandlers(io, socket);
        registerMessageHandlers(io, socket);
        registerLocationHandlers(io, socket);
        registerAppointmentHandlers(io, socket);
        registerChatHandlers(io, socket);

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket ${socket.id} disconnected. Reason: ${reason}`);

            // Remove socket from appointment listeners
            appointmentListeners.delete(socket);

            // Find and remove disconnected user
            let disconnectedUserId = null;
            let disconnectedUsername = null;

            for (const [userId, userInfo] of connectedUsers.entries()) {
                if (userInfo.socketId === socket.id) {
                    disconnectedUserId = userId;
                    disconnectedUsername = userInfo.username;
                    break;
                }
            }

            if (disconnectedUserId) {
                connectedUsers.delete(disconnectedUserId);
                recordUserDisconnection(disconnectedUserId);
                console.log(`👤 User ${disconnectedUsername} (${disconnectedUserId}) disconnected`);

                // Notify others that user is offline
                try { socket.broadcast.emit('userStatusChanged', { userId: disconnectedUserId, status: 'inactive' }); } catch (e) { /* Redis may be down */ }
            }

            // Clean up tracking sessions
            for (const [sessionId, session] of trackingSessions.entries()) {
                // Remove disconnected trackee
                for (const [trackeeId, trackeeInfo] of session.trackees.entries()) {
                    if (trackeeInfo.socketId === socket.id) {
                        session.trackees.delete(trackeeId);
                        console.log(`📍 BDM ${trackeeId} left tracking session ${sessionId}`);

                        // Notify watchers that BDM disconnected
                        socket.to(`session_${sessionId}`).emit('bdmDisconnected', {
                            sessionId,
                            userId: trackeeId
                        });
                    }
                }
            }
        });

        // Handle connection errors
        socket.on('error', (error) => {
            console.error(`🔌 Socket error for ${socket.id}:`, error);
        });
    });
};

module.exports = setupSocketIO;
