const mongoose = require('mongoose');
const Appointment = require('./models/Appointment');
require('dotenv').config();

const checkAppointments = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm_db');
        console.log('Connected to MongoDB');

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        console.log(`Checking appointments for today: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

        const count = await Appointment.countDocuments({
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        console.log(`Total appointments found for today: ${count}`);

        if (count > 0) {
            const stats = await Appointment.aggregate([
                {
                    $match: {
                        date: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalMet: { $sum: { $cond: [{ $eq: ["$met", true] }, 1, 0] } },
                        totalNotMet: { $sum: { $cond: [{ $eq: ["$met", false] }, 1, 0] } }
                    }
                }
            ]);
            console.log('Stats breakdown:', stats);
        } else {
            // Check for ANY appointments to verify DB isn't empty
            const total = await Appointment.countDocuments({});
            console.log(`Total appointments in ENTIRE database: ${total}`);
            if (total > 0) {
                const sample = await Appointment.findOne().sort({ date: -1 });
                console.log('Most recent appointment date:', sample.date);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkAppointments();
