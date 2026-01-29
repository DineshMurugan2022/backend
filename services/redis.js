const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => logger.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => logger.error('Redis Sub Client Error:', err));

let connectingPromise = null;

const connectRedis = async (retries = 5) => {
    // If already ready, nothing to do
    if (pubClient.isOpen && pubClient.isReady) return true; // Return true for consistency

    // If already connecting, wait for that promise
    if (connectingPromise) return connectingPromise;

    connectingPromise = (async () => {
        try {
            console.log('🔌 Attempting to connect to Redis...');

            if (!pubClient.isOpen) {
                await Promise.all([
                    pubClient.connect(),
                    subClient.connect()
                ]);
            }

            // Wait for both clients to be ready
            if (!pubClient.isReady || !subClient.isReady) {
                await Promise.all([
                    pubClient.isReady ? Promise.resolve() : new Promise(resolve => pubClient.once('ready', resolve)),
                    subClient.isReady ? Promise.resolve() : new Promise(resolve => subClient.once('ready', resolve))
                ]);
            }

            logger.info('✅ Redis Clients (Pub/Sub) Connected and Ready');
            return true;
        } catch (err) {
            logger.error(`❌ Redis Connection Failed (Retries left: ${retries}):`, err);
            connectingPromise = null; // Reset so next attempt can try

            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return connectRedis(retries - 1);
            } else if (process.env.NODE_ENV === 'production') {
                console.error('🔥 Redis failed permanently in production. Background tasks may fail.');
            }
            return false;
        }
    })();

    return connectingPromise;
};

// Start connection immediately
connectRedis();

module.exports = {
    pubClient,
    subClient,
    connectRedis
};
