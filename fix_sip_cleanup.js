const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected');

    const users = await User.find({ deleted: { $ne: true } }).select('username sipExtension sipUsername sipPassword sipDomain');

    for (const u of users) {
        const fixes = {};

        // Fix @cccpl or @anything suffix in sipUsername
        if (u.sipUsername && u.sipUsername.includes('@')) {
            fixes.sipUsername = u.sipUsername.split('@')[0];
        }

        // Fix doubled sipExtension (e.g. '701701' → '701')
        if (u.sipExtension && u.sipExtension.length >= 6) {
            const half = u.sipExtension.slice(0, u.sipExtension.length / 2);
            if (u.sipExtension === half + half) fixes.sipExtension = half;
        }

        // Fix doubled sipUsername (e.g. '102597701102597701' → '102597701')
        if (u.sipUsername && u.sipUsername.length >= 18 && !u.sipUsername.includes('@')) {
            const half = u.sipUsername.slice(0, u.sipUsername.length / 2);
            if (u.sipUsername === half + half) fixes.sipUsername = half;
        }

        if (Object.keys(fixes).length > 0) {
            await User.updateOne({ _id: u._id }, { $set: fixes });
            console.log('Fixed ' + u.username + ':', JSON.stringify(fixes));
        }
    }

    console.log('\nAll users SIP state after cleanup:');
    const all = await User.find({ deleted: { $ne: true } }).select('username sipExtension sipUsername');
    all.forEach(u => console.log('  ' + u.username + ': ext=' + u.sipExtension + ', auth=' + u.sipUsername));

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
