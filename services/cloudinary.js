const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary');
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage for Leads
const leadStorage = CloudinaryStorage({
    cloudinary: cloudinary,
    folder: 'crm/leads',
    allowedFormats: ['jpg', 'png', 'pdf', 'xlsx', 'csv'],
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(undefined, `${uniqueSuffix}-${file.originalname.split('.')[0]}`);
    }
});

// Storage for Chat
const chatStorage = CloudinaryStorage({
    cloudinary: cloudinary,
    folder: 'crm/chat',
    allowedFormats: ['jpg', 'png', 'jpeg', 'gif', 'pdf'],
    filename: (req, file, cb) => cb(undefined, `chat-${Date.now()}`)
});

module.exports = {
    cloudinary,
    leadStorage,
    chatStorage
};
