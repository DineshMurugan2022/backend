const mongoose = require('mongoose');
const User = require('./models/User');
const Attendance = require('./models/Attendance');

const MONGO_URI = 'mongodb://crmapp:Dinesh%406702@cluster2002-shard-00-00.45u9g.mongodb.net:27017,cluster2002-shard-00-01.45u9g.mongodb.net:27017,cluster2002-shard-00-02.45u9g.mongodb.net:27017/crmDB?ssl=true&replicaSet=atlas-23pujq-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Connected to MongoDB.");
        // Find all attendance records, group them by user and date String, look for duplicates
        const records = await Attendance.find({}).populate('user', 'username').lean();
        console.log(`Found ${records.length} records`);

        const toYMD = (d) => {
            const date = new Date(d);
            return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        };

        const grouped = {};
        records.forEach(r => {
            if (!r.user) return;
            const key = `${r.user.username}_${toYMD(r.date)}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(r);
        });

        let duplicateCount = 0;
        for (const [key, docs] of Object.entries(grouped)) {
            if (docs.length > 1) {
                duplicateCount++;
                console.log(`\nDuplicate found for ${key}:`);
                docs.forEach(d => {
                    console.log(`  - _id: ${d._id}, date: ${d.date.toISOString()}, status: ${d.status}, loginTime: ${d.loginTime ? d.loginTime.toISOString() : 'none'}`);
                });

                // Auto clean: keep the one that was updated most recently or the one with loginTime
                docs.sort((a, b) => {
                    const aValid = a.loginTime ? 1 : 0;
                    const bValid = b.loginTime ? 1 : 0;
                    if (aValid !== bValid) return bValid - aValid;
                    // if both or neither have loginTime, keep the one created/updated later
                    return new Date(b.updatedAt) - new Date(a.updatedAt);
                });

                // Delete all but the first (best) one
                const [keep, ...remove] = docs;
                console.log(`    -> Keeping: ${keep._id}`);

                // Consolidate 'status' from the most recently updated one into the kept one if we're keeping the one with loginTime
                // (Actually the most recent update should dictate the status)
                const mostRecentStatus = docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].status;

                await Attendance.updateOne({ _id: keep._id }, { $set: { status: mostRecentStatus } });

                for (const rm of remove) {
                    await Attendance.deleteOne({ _id: rm._id });
                    console.log(`    -> Deleted: ${rm._id}`);
                }
            }
        }

        console.log(`\nCleanup complete. Cleaned ${duplicateCount} instances of duplicates.`);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
