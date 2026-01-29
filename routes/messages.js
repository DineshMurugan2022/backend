const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');
const { getIOInstance } = require('../sockets/io');
const { chatStorage } = require('../services/cloudinary');

const multer = require('multer');

const fs = require('fs');

// Configure multer for file upload using Cloudinary
const upload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get unread message count - WITH DEBUG LOGGING
router.get('/unread-count', auth, async (req, res) => {
  console.log('🔍 [DEBUG] Unread count endpoint hit');

  try {
    console.log('🔍 [DEBUG] req.user exists:', !!req.user);
    console.log('🔍 [DEBUG] req.user.id:', req.user?.id);
    console.log('🔍 [DEBUG] req.user._id:', req.user?._id);

    // Handle both req.user.id and req.user._id
    const currentUserId = req.user.id || req.user._id;

    console.log('🔍 [DEBUG] Extracted user ID:', currentUserId);

    if (!currentUserId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('📬 Fetching unread count for user:', currentUserId);
    console.log('🔍 [DEBUG] About to query database...');

    const unreadCount = await Message.countDocuments({
      recipient: currentUserId,
      read: false
    });

    console.log('📬 Unread count result:', unreadCount);

    res.json({ unreadCount });
  } catch (error) {
    console.error('❌ Error fetching unread count:');
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
      name: error.name
    });
  }
});

// Get conversation between two users (simplified for new chat)
router.get('/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id || req.user._id;

    // Validate that the user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId }
      ]
    })
      .populate('sender', 'username name')
      .populate('recipient', 'username name')
      .sort({ timestamp: 1 })
      .limit(100); // Limit to last 100 messages

    // Transform to match frontend format
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      from: msg.sender._id.toString(),
      to: msg.recipient._id.toString(),
      message: msg.content,
      timestamp: msg.timestamp
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Keep the old route for backwards compatibility
router.get('/conversation/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id || req.user._id;

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId }
      ]
    })
      .populate('sender', 'username name')
      .populate('recipient', 'username name')
      .sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a new message (simplified for new chat)
router.post('/', auth, async (req, res) => {
  try {
    const { to, message } = req.body;
    const from = req.user.id || req.user._id;

    // Validate recipient exists
    const recipient = await User.findById(to);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Validate message content
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Create new message
    const newMessage = new Message({
      sender: from,
      recipient: to,
      content: message,
      timestamp: new Date()
    });

    await newMessage.save();

    // Populate sender and recipient info
    await newMessage.populate('sender', 'username name');
    await newMessage.populate('recipient', 'username name');

    // Emit message to recipient via Socket.IO
    const io = getIOInstance();
    if (io) {
      io.to(`user_${to}`).emit('chat:message', {
        _id: newMessage._id,
        from,
        to,
        message,
        timestamp: newMessage.timestamp
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a new message (with optional file) - keep for backwards compatibility
router.post('/send', auth, upload.single('file'), async (req, res) => {
  try {
    const { recipientId, content, messageType = 'text' } = req.body;
    const senderId = req.user.id || req.user._id;
    const file = req.file;

    // Validate recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Validate content or file
    if ((!content || content.trim() === '') && !file) {
      return res.status(400).json({ error: 'Message content or file is required' });
    }

    // Construct message data
    const messageData = {
      sender: senderId,
      recipient: recipientId,
      content: content || (file ? 'Sent a file' : ''),
      messageType: file ? (file.mimetype.startsWith('image/') ? 'image' : 'file') : messageType
    };

    if (file) {
      // Use Cloudinary secure URL
      messageData.mediaUrl = file.path;
      messageData.fileName = file.originalname;
      messageData.mimeType = file.mimetype;
      messageData.content = file.originalname; // Show filename as content/fallback
    }

    // Create new message
    const message = new Message(messageData);

    await message.save();

    // Populate sender and recipient info
    await message.populate('sender', 'username name');
    await message.populate('recipient', 'username name');

    // Emit message to recipient via Socket.IO
    const io = getIOInstance();
    if (io) {
      // Emit to recipient's specific room
      io.to(`user_${recipientId}`).emit('newMessage', message);

      // Emit to sender's specific room as well for consistency
      io.to(`user_${senderId}`).emit('messageSent', message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark messages as read
router.put('/read/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id || req.user._id;

    // Update all messages from this user to current user as read
    await Message.updateMany(
      { sender: userId, recipient: currentUserId, read: false },
      { read: true }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;