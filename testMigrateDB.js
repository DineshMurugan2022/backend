const mongoose = require('mongoose');
const User = require('./models/User');
const Attendance = require('./models/Attendance');

const MONGO_URI = 'mongodb://crmapp:Dinesh%406702@cluster2002-shard-00-00.45u9g.mongodb.net:27017,cluster2002-shard-00-01.45u9g.mongodb.net:27017,cluster2002-shard-00-02.45u9g.mongodb.net:27017/crmDB?ssl=true&replicaSet=atlas-23pujq-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Connected to MongoDB.");

        let migratedCnt = 0;

        // Find all attendance records, group them by user and date String, look for duplicates
        // Also change offset dates to 00:00:00 UTC
        let records = await Attendance.find({}).lean();
        console.log(`Found ${records.length} records`);

        for (let r of records) {
            if (r.date) {
                const d = new Date(r.date.getTime());
                if (d.getUTCHours() !== 0) {
                    // If the time is not midnight UTC, we re-parse it as if the local Date string was used
                    // E.g. "2026-03-04T18:30:00.000Z" (which is March 5th 00:00:00 IST) -> we extract local March 5th
                    const yyyy = d.getFullYear(); // Local Year
                    const mm = d.getMonth() + 1; // Local Month
                    const dd = d.getDate(); // Local Date
                    const targetUTC = new Date(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);

                    await Attendance.updateOne({ _id: r._id }, { $set: { date: targetUTC } });
                    migratedCnt++;
                }
            }
        }

        console.log(`Migrated ${migratedCnt} incorrectly offset records to 00:00:00.000Z.`);

        // Wait and fetch them all again to find actual duplicates now that times are unified
        records = await Attendance.find({}).populate('user', 'username').lean();

        const toYMD = (d) => {
            const date = new Date(d);
            return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
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

                docs.sort((a, b) => {
                    const aValid = a.loginTime ? 1 : 0;
                    const bValid = b.loginTime ? 1 : 0;
                    if (aValid !== bValid) return bValid - aValid;
                    return new Date(b.updatedAt) - new Date(a.updatedAt);
                });

                // Delete all but the first (best) one
                const [keep, ...remove] = docs;

                // Consolidate 'status' from the most recently updated one into the kept one
                const mostRecentUpdatedDoc = docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
                const mostRecentStatus = mostRecentUpdatedDoc.status;

                await Attendance.updateOne({ _id: keep._id }, { $set: { status: mostRecentStatus } });

                for (const rm of remove) {
                    await Attendance.deleteOne({ _id: rm._id });
                }
            }
        }

        console.log(`Cleanup complete. Cleaned ${duplicateCount} instances of duplicates post-migration.`);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
