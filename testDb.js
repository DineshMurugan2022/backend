const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');

mongoose.connect('mongodb://localhost:27017/crm')
    .then(async () => {
        console.log("Connected to MongoDB.");
        const records = await Attendance.find({}).sort({ date: -1 }).limit(20).populate('user', 'username');
        for (const r of records) {
            console.log(`User: ${r.user?.username}, Date: ${r.date.toISOString()}, Status: ${r.status}, LoginTime: ${r.loginTime ? r.loginTime.toISOString() : 'none'}`);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
