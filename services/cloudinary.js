const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage for Leads
const leadStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'crm/leads',
        resource_type: 'auto', // Support PDF, images, etc.
        allowed_formats: ['jpg', 'png', 'pdf', 'xlsx', 'csv'],
        public_id: (req, file) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            return `${uniqueSuffix}-${file.originalname.split('.')[0]}`;
        }
    }
});

// Storage for Chat
const chatStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'crm/chat',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf'],
        public_id: (req, file) => `chat-${Date.now()}`
    }
});

module.exports = {
    cloudinary,
    leadStorage,
    chatStorage
};
