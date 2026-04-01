/**
 * fix_sip_pstn.js
 * ================
 * DIAGNOSIS (from CloudConnect desktop logs, 2026-04-01):
 * - Extension 102597701 (ext 701) → PSTN calls WORK ✅
 * - Extension 102597703 (ext 703) → PSTN calls fail with 480 NORMAL_CLEARING ❌
 *   (ext 702, 704 likely same issue - not yet confirmed working)
 *
 * ROOT CAUSE: CloudConnect PBX has NOT granted PSTN outbound calling rights to
 * extensions 702/703/704. Only 701 is proven to work for PSTN INVITE routing.
 *
 * SOLUTION: Two approaches:
 *   1. (RECOMMENDED) Ask CloudConnect admin to enable PSTN for exts 702-704.
 *   2. (QUICK FIX - this script) Set all browser users to use ext 701 (shared account).
 *      This means simultaneous calls from multiple agents won't work (they'll
 *      fight over the registration), but solo calling will work immediately.
 *
 * Run: node fix_sip_pstn.js
 */

const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// ══════════════════════════════════════════════════════════════
// OPTION 1: SHARED - All users use the single working ext 701
// Comment out and use OPTION 2 if each user needs their own ext.
// ══════════════════════════════════════════════════════════════
const SHARED_WORKING_EXT = {
    sipExtension: '701',
    sipUsername: '102597701',
    sipPassword: 'B&Y@005#',
    sipDomain: 'sip2.cloud-connect.in'
};

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Show current state
    const allUsers = await User.find({ sipUsername: { $ne: '' } }).select('username sipExtension sipUsername');
    console.log('\n📋 Current SIP assignments:');
    allUsers.forEach(u => console.log(`  ${u.username}: ext=${u.sipExtension}, auth=${u.sipUsername}`));

    console.log('\n🔧 Updating all telecaller users to use ext 701 (confirmed PSTN-capable)...\n');

    // Update users who currently have non-working extensions
    const telecallerUsers = ['Thilag@bny', 'Thenmozhi@bny', 'Sowbar@bny'];
    for (const username of telecallerUsers) {
        const res = await User.updateOne(
            { username },
            { $set: SHARED_WORKING_EXT }
        );
        if (res.matchedCount > 0) {
            console.log(`  ✅ ${username}: updated to ext 701 (matched=${res.matchedCount}, modified=${res.modifiedCount})`);
        } else {
            console.log(`  ⚠️  ${username}: user NOT FOUND in database`);
        }
    }

    // Verify the currently failing user specifically
    const failingUser = await User.findById('68fcc5bfb85c2281711925bb').select('username sipExtension sipUsername');
    if (failingUser) {
        console.log(`\n🔍 Failing user by ID: ${failingUser.username} → ext=${failingUser.sipExtension}, auth=${failingUser.sipUsername}`);
        if (failingUser.sipUsername !== '102597701') {
            await User.findByIdAndUpdate('68fcc5bfb85c2281711925bb', { $set: SHARED_WORKING_EXT });
            console.log(`  ✅ Updated failing user to ext 701`);
        } else {
            console.log(`  ✅ Already on ext 701`);
        }
    }

    console.log('\n✅ Done. Hard-reload the browser for new credentials to take effect.');
    console.log('📝 NOTE: Ask CloudConnect admin to enable PSTN for exts 702-704 for proper multi-agent support.');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
