const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => logger.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => logger.error('Redis Sub Client Error:', err));

const connectRedis = async (retries = 5) => {
    // Check if client is already connected or connecting
    if (pubClient.isOpen && pubClient.isReady) return;

    try {
        console.log('🔌 Attempting to connect to Redis...');
        if (!pubClient.isOpen) {
            await Promise.all([
                pubClient.connect(),
                subClient.connect()
            ]);
        }

        // Wait for ready event if not already ready
        if (!pubClient.isReady) {
            await new Promise((resolve) => {
                pubClient.once('ready', resolve);
                // Safety timeout
                setTimeout(resolve, 5000);
            });
        }

        logger.info('✅ Redis Connected successfully');
    } catch (err) {
        logger.error(`❌ Redis Connection Failed (Retries left: ${retries}):`, err);
        if (retries > 0) {
            setTimeout(() => connectRedis(retries - 1), 5000);
        } else if (process.env.NODE_ENV === 'production') {
            console.error('🔥 Redis failed in production. Continuing without Redis adapter if possible.');
            // Don't exit(1) immediately, let the app try to run without adapter if it can
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
