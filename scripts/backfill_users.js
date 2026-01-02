const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('Connection Error:', err);
        process.exit(1);
    }
};

const backfill = async () => {
    await connectDB();
    try {
        // Set a default "joined date" of Jan 1, 2024 for anyone missing it
        const defaultDate = new Date('2024-01-01');

        const res = await User.updateMany(
            { createdAt: { $exists: false } },
            { $set: { createdAt: defaultDate, updatedAt: new Date() } }
        );

        console.log(`Backfill complete. Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`);
    } catch (error) {
        console.error('Backfill failed:', error);
    } finally {
        mongoose.disconnect();
    }
};

backfill();
