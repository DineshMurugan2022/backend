const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');

const MONGO_URI = 'mongodb://crmapp:Dinesh%406702@cluster2002-shard-00-00.45u9g.mongodb.net:27017,cluster2002-shard-00-01.45u9g.mongodb.net:27017,cluster2002-shard-00-02.45u9g.mongodb.net:27017/crmDB?ssl=true&replicaSet=atlas-23pujq-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(async () => {
        // Find Dinesh. M (assuming name is "Dinesh. M" or username is something with "Dinesh")
        const User = require('./models/User');
        const user = await User.findOne({
            $or: [{ name: /Dinesh/i }, { username: /Dinesh/i }]
        });

        if (!user) {
            console.log("User not found");
            process.exit(0);
        }
        console.log(`Found user: ${user.username} (${user._id})`);

        const records = await Attendance.find({ user: user._id }).sort({ date: -1 }).limit(10);
        for (r of records) {
            console.log(`Date: ${r.date.toISOString()}, Local Date: ${new Date(r.date.getTime()).toLocaleString()}, Status: ${r.status}, LoginTime: ${r.loginTime ? r.loginTime.toLocaleString() : 'none'}`);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
