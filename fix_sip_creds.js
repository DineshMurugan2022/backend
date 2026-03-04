const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected');

    // Restore correct per-user extensions based on what was observed
    const updates = [
        { username: 'admin', sipExtension: '701', sipUsername: '102597701', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
        { username: 'Dinesh@bny', sipExtension: '701', sipUsername: '102597701', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
        { username: 'Thilag@bny', sipExtension: '702', sipUsername: '102597702', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
        { username: 'Thenmozhi@bny', sipExtension: '703', sipUsername: '102597703', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
        { username: 'Sowbar@bny', sipExtension: '704', sipUsername: '102597704', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
        { username: 'Gopi@bny', sipExtension: '701', sipUsername: '102597701', sipPassword: 'B&Y@005#', sipDomain: 'sip2.cloud-connect.in' },
    ];

    for (const u of updates) {
        const res = await User.updateOne(
            { username: u.username },
            { $set: { sipExtension: u.sipExtension, sipUsername: u.sipUsername, sipPassword: u.sipPassword, sipDomain: u.sipDomain } }
        );
        console.log(`${u.username}: ext=${u.sipExtension} → matched=${res.matchedCount}, modified=${res.modifiedCount}`);
    }

    console.log('\n✅ All user extensions restored correctly.');
    process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
