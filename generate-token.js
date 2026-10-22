const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();
if (!process.env.SIP_PASSWORD) throw new Error('Set SIP_PASSWORD in the environment before running this maintenance script.');
const User = require('./models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Update Dinesh@bny to Extension 701
  const user = await User.findOneAndUpdate(
    { username: 'Dinesh@bny' },
    { 
      $set: { 
        sipExtension: '701', 
        sipUsername: '102597701',
        sipPassword: process.env.SIP_PASSWORD,
        sipDomain: 'sip2.cloud-connect.in'
      } 
    },
    { new: true }
  );

  const token = jwt.sign(
    {
      id: user._id.toString(),
      username: user.username,
      userGroup: user.userGroup,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  console.log('USER_ID=' + user._id.toString());
  console.log('TOKEN=' + token);
  console.log('SIP_EXTENSION=' + user.sipExtension);
  console.log('SIP_USERNAME=' + user.sipUsername);
  process.exit(0);
}

run().catch(console.error);
