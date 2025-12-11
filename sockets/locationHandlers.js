const User = require("../models/User");
const { recordLocationUpdate } = require("../services/session");
const { trackingSessions } = require("./state");

module.exports = (io, socket) => {
    // Handle BDM joining a tracking session
    socket.on('joinAsTrackee', (data) => {
        const { sessionId, userId, userData } = data;
        if (sessionId && userId) {
            socket.join(`session_${sessionId}`);
            console.log(`📍 BDM ${userId} joined tracking session ${sessionId}`);

            // Store session info
            if (!trackingSessions.has(sessionId)) {
                trackingSessions.set(sessionId, {
                    trackees: new Map(),
                    watchers: new Set()
                });
            }

            const session = trackingSessions.get(sessionId);
            session.trackees.set(userId, {
                ...userData,
                userId,
                socketId: socket.id,
                joinedAt: new Date()
            });

            // Notify watchers that a new BDM joined
            socket.to(`session_${sessionId}`).emit('bdmJoined', {
                sessionId,
                userId,
                userData
            });
        }
    });

    // Handle location updates from BDMs with enhanced error handling and logging
    socket.on('bdmLocationUpdate', async (data) => {
        try {
            const { sessionId, userId, lat, lng, accuracy, speed, heading, timestamp } = data;

            // Validate required data
            if (!userId) {
                console.warn('⚠️ Location update missing userId');
                socket.emit('locationUpdateError', {
                    error: 'Missing userId in location update',
                    message: 'User ID is required for location updates'
                });
                return;
            }

            // Log the incoming location update
            const LocationLog = require("../models/LocationLog");
            console.log(`📍 Received location update from BDM ${userId}: ${lat}, ${lng} (±${accuracy}m)`);

            // Record location update for attendance tracking
            recordLocationUpdate(userId);

            // Update user's location in database with error handling
            try {
                const updateData = {
                    lat,
                    lng,
                    loginStatus: 'active', // Mark as active when location is updated
                    lastUpdate: new Date() // Update lastUpdate timestamp
                };

                // Only update accuracy if it's provided and reasonable
                if (accuracy !== undefined && accuracy <= 200) {
                    updateData.accuracy = accuracy;
                }

                await User.findByIdAndUpdate(userId, updateData);

                // Save to LocationLog for path history
                const log = new LocationLog({
                    userId,
                    lat,
                    lng,
                    accuracy,
                    speed,
                    heading,
                    timestamp: new Date()
                });
                await log.save();

                console.log(`✅ Updated location for user ${userId} and saved log`);
            } catch (dbError) {
                console.error('❌ Error updating user location in database:', dbError);
            }

            // Broadcast location update to session watchers if session exists
            if (sessionId) {
                socket.to(`session_${sessionId}`).emit('bdmLocationChanged', {
                    sessionId,
                    userId,
                    lat,
                    lng,
                    accuracy,
                    speed,
                    heading,
                    timestamp
                });
                console.log(`📡 Broadcast location update to session ${sessionId}`);
            } else {
                // If no session, broadcast to all connected users
                socket.broadcast.emit('bdmLocationChanged', {
                    userId,
                    lat,
                    lng,
                    accuracy,
                    speed,
                    heading,
                    timestamp
                });
                console.log(`📡 Broadcast location update to all users (no session)`);
            }

            // Send success response back to client
            socket.emit('locationUpdateSuccess', {
                message: 'Location update processed successfully',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error processing location update:', error);
            // Send error response back to client
            socket.emit('locationUpdateError', {
                error: 'Failed to process location update',
                message: error.message
            });
        }
    });
};
