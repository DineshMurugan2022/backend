const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  mediaUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  mimeType: {
    type: String,
    default: null
  },
  read: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for better query performance
messageSchema.index({ sender: 1, recipient: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);