const setupChatHandlers = (io, socket) => {
    // Handle chat messages
    socket.on('chat:message', (data) => {
        const { to, message } = data;

        // Emit to recipient
        io.to(`user_${to}`).emit('chat:message', {
            ...data,
            from: socket.handshake.auth?.userId || socket.handshake.query?.userId
        });

        console.log(`💬 Chat message from ${data.from} to ${to}`);
    });

    // Handle typing indicators
    socket.on('chat:typing', (data) => {
        const { to } = data;
        const from = socket.handshake.auth?.userId || socket.handshake.query?.userId;

        io.to(`user_${to}`).emit('chat:typing', {
            userId: from
        });
    });

    socket.on('chat:stopTyping', (data) => {
        const { to } = data;
        const from = socket.handshake.auth?.userId || socket.handshake.query?.userId;

        io.to(`user_${to}`).emit('chat:stopTyping', {
            userId: from
        });
    });

    // Emit online status when user connects
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    if (userId) {
        try { socket.broadcast.emit('user:online', userId); } catch (e) { /* Redis may be down */ }
    }
};

module.exports = setupChatHandlers;
