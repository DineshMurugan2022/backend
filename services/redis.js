const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => logger.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => logger.error('Redis Sub Client Error:', err));

const connectRedis = async (retries = 5) => {
    if (pubClient.isOpen && pubClient.isReady) return;

    try {
        if (!pubClient.isOpen) {
            await Promise.all([
                pubClient.connect(),
                subClient.connect()
            ]);
        }
        logger.info('✅ Redis Connected successfully');
    } catch (err) {
        logger.error(`❌ Redis Connection Failed (Retries left: ${retries}):`, err);
        if (retries > 0) {
            setTimeout(() => connectRedis(retries - 1), 5000);
        } else if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

// Start connection immediately
connectRedis();

module.exports = {
    pubClient,
    subClient,
    connectRedis
};
