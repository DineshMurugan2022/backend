const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Restore correct per-user extensions based on the original data before my change
const ORIGINAL_EXTENSIONS = [
    { username: 'admin', sipExtension: '701', sipUsername: '102597701' },
    { username: 'Dinesh@bny', sipExtension: '701', sipUsername: '102597701' },
    { username: 'Yuga@bny', sipExtension: '701', sipUsername: '102597701' },
    { username: 'venkat@bny', sipExtension: '702', sipUsername: '102597702' },
    { username: 'Gopi@bny', sipExtension: '701', sipUsername: '102597701' },
    { username: 'Thenmozhi@bny', sipExtension: '703', sipUsername: '102597703' },
    { username: 'Sowbar@bny', sipExtension: '704', sipUsername: '102597704' },
    { username: 'agasthiya@bny', sipExtension: '702', sipUsername: '102597702' },
    { username: 'anbukkarasi@bny', sipExtension: '705', sipUsername: '102597705' }
];

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔧 Restoring original individual SIp extensions...\n');

    for (const u of ORIGINAL_EXTENSIONS) {
        const res = await User.updateOne(
            { username: u.username },
            { $set: { sipExtension: u.sipExtension, sipUsername: u.sipUsername } }
        );
        if (res.matchedCount > 0) {
            console.log(`  ✅ ${u.username}: restored to ext ${u.sipExtension}`);
        } else {
            console.log(`  ⚠️  ${u.username}: user NOT FOUND`);
        }
    }

    console.log('\n✅ Extensions restored. Agents will now receive their own incoming calls.');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
