const mongoose = require('mongoose');
const Appointment = require('./models/Appointment');
const User = require('./models/User');
require('dotenv').config();

const addTestAppointment = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crm_db');
        console.log('Connected to MongoDB');

        // Find a BDM
        const bdm = await User.findOne({ userGroup: 'bdm' });
        if (!bdm) {
            console.log('No BDM found to assign appointment to.');
            process.exit(0);
        }

        console.log(`Found BDM: ${bdm.username} (${bdm._id})`);

        // Create appointment for today
        const appointment = new Appointment({
            client: 'Test Client Today',
            companyName: 'Test Company',
            date: new Date(), // Now
            met: true,
            assignedBDM: bdm._id,
            createdBy: bdm._id, // Self-created
            remark: 'System generated test appointment'
        });

        await appointment.save();
        console.log('✅ Created test appointment for today with Met=true');
        console.log(appointment);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

addTestAppointment();
