const mongoose = require('mongoose');
const { createClient } = require('redis');
require('dotenv').config();

const MONGO_URI_DIRECT = "mongodb://crmapp:Dinesh%406702@cluster2002-shard-00-00.45u9g.mongodb.net:27017,cluster2002-shard-00-01.45u9g.mongodb.net:27017,cluster2002-shard-00-02.45u9g.mongodb.net:27017/crmDB?ssl=true&replicaSet=atlas-23pujq-shard-0&authSource=admin&retryWrites=true&w=majority";

async function testMongo() {
    console.log('Testing MongoDB Direct...');
    try {
        await mongoose.connect(MONGO_URI_DIRECT);
        console.log('✅ MongoDB Connected!');
    } catch (err) {
        console.error('❌ MongoDB Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

async function testRedis() {
    console.log('Testing Redis...');
    const client = createClient({ url: process.env.REDIS_URL });
    try {
        await client.connect();
        console.log('✅ Redis Connected!');
        await client.disconnect();
    } catch (err) {
        console.error('❌ Redis Error:', err);
    }
}

async function run() {
    await testMongo();
    await testRedis();
}

run();
