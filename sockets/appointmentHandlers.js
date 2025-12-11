const { appointmentListeners } = require("./state");

module.exports = (io, socket) => {
    // Handle appointment updates
    socket.on('appointmentUpdated', (data) => {
        console.log(`📋 Appointment updated:`, data);

        // Broadcast to all connected clients that an appointment was updated
        for (const listener of appointmentListeners) {
            if (listener !== socket) { // Don't send to the sender
                listener.emit('appointmentUpdated', data);
            }
        }

        // Also emit to user-specific rooms for targeted notifications
        if (data.appointment?.createdBy) {
            socket.to(`user_${data.appointment.createdBy}`).emit('appointmentUpdated', data);
        }
    });
};
