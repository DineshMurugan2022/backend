const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// CloudConnect Admin DID Routing Settings (2026-04-01):
// 08037565994 -> Agasthiya (701)
// 08037565995 -> Gopi TL (702)
// 08037565996 -> Karthick (703)
// 08037565997 -> Sowbarkhan (704)
// 08037565998 -> Thenmozhi (705)

const ACCURATE_PBX_MAPPING = [
    { username: 'agasthiya@bny',  sipExtension: '701', sipUsername: '102597701' },
    { username: 'Gopi@bny',       sipExtension: '702', sipUsername: '102597702' },
    { username: 'Karthikeyan@bny',sipExtension: '703', sipUsername: '102597703' }, // Assuming this is Karthick
    { username: 'Sowbar@bny',     sipExtension: '704', sipUsername: '102597704' },
    { username: 'Thenmozhi@bny',  sipExtension: '705', sipUsername: '102597705' }
];

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔧 Re-aligning CRM User SIP Accounts to match CloudConnect PBX Routing...\n');

    for (const u of ACCURATE_PBX_MAPPING) {
        const res = await User.updateOne(
            { username: new RegExp('^' + u.username.replace(/@/g, '\\@') + '$', 'i') }, 
            { $set: { sipExtension: u.sipExtension, sipUsername: u.sipUsername } }
        );
        if (res.matchedCount > 0) {
            console.log(`  ✅ Successfully updated ${u.username} to Extension ${u.sipExtension}`);
        } else {
            console.log(`  ⚠️  User ${u.username} not found!`);
        }
    }

    // Unassign extensions from users who shouldn't have them anymore to prevent them from stealing calls
    const mappedExtensions = ACCURATE_PBX_MAPPING.map(m => m.sipExtension);
    const result = await User.updateMany(
        { 
            sipExtension: { $in: mappedExtensions }, 
            username: { $nin: ACCURATE_PBX_MAPPING.map(m => m.username) } 
        },
        { $set: { sipExtension: '', sipUsername: '' } }
    );
    console.log(`\n🧹 Removed extensions from ${result.modifiedCount} users who were incorrectly assigned these extensions.`);

    console.log('\n✅ PBX Mapping complete. Please hard reload browsers.');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
