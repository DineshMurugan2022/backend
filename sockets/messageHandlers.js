const User = require("../models/User");
const Message = require("../models/Message");

module.exports = (io, socket) => {
    // Handle new message
    socket.on('sendMessage', async (messageData) => {
        try {
            const { recipientId, content, messageType = 'text' } = messageData;
            const senderId = messageData.senderId || socket.userId;

            // Validate recipient exists
            const recipient = await User.findById(recipientId);
            if (!recipient) {
                socket.emit('messageError', { error: 'Recipient not found' });
                return;
            }

            // Validate content
            if (!content || content.trim() === '') {
                socket.emit('messageError', { error: 'Message content is required' });
                return;
            }

            // Create new message
            const message = new Message({
                sender: senderId,
                recipient: recipientId,
                content,
                messageType
            });

            await message.save();

            // Populate sender and recipient info
            await message.populate('sender', 'username name');
            await message.populate('recipient', 'username name');

            // Emit message to recipient via Socket.IO
            socket.to(`user_${recipientId}`).emit('newMessage', message);

            // Emit to sender as well for consistency
            socket.emit('messageSent', message);

            console.log(`💬 Message sent from ${senderId} to ${recipientId}: ${content}`);
        } catch (error) {
            console.error('Error sending message via socket:', error);
            socket.emit('messageError', { error: 'Failed to send message' });
        }
    });
};
