const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// ----------------- CONFIGURATION -----------------
const REDIS_CONFIG = {
    url: redisUrl,
    socket: {
        connectTimeout: 10000,
        keepAlive: 5000,
        reconnectStrategy: (retries) => {
            if (retries > 20) return new Error('Retry limit reached');
            return Math.min(retries * 100, 3000);
        }
    }
};

// Create separate instances for Pub and Sub (Recommended for high stability)
const pubClient = createClient(REDIS_CONFIG);
const subClient = createClient(REDIS_CONFIG);

pubClient.on('error', (err) => logger.error('🔴 Redis Pub Client Error:', err.message));
subClient.on('error', (err) => logger.error('🔴 Redis Sub Client Error:', err.message));

let connectingPromise = null;

const connectRedis = async (retries = 5) => {
    // Return early if both are ready
    if (pubClient.isReady && subClient.isReady) return true;

    // Wait for existing connection attempt if one is in progress
    if (connectingPromise) return connectingPromise;

    connectingPromise = (async () => {
        try {
            console.log('🔌 Attempting to connect to Redis...');

            // Connect Pub Client
            if (!pubClient.isOpen) {
                await pubClient.connect();
            }

            // Connect Sub Client
            if (!subClient.isOpen) {
                await subClient.connect();
            }

            // Ensure both are fully "Ready" (after Ping/Pong)
            if (!pubClient.isReady || !subClient.isReady) {
                await Promise.all([
                    pubClient.isReady ? Promise.resolve() : new Promise(res => pubClient.once('ready', res)),
                    subClient.isReady ? Promise.resolve() : new Promise(res => subClient.once('ready', res))
                ]);
            }

            logger.info('✅ Redis Clients (Pub/Sub) Connected and Ready');
            connectingPromise = null;
            return true;
        } catch (err) {
            logger.error(`❌ Redis Connection Failed (Retries left: ${retries}):`, err.message);
            connectingPromise = null;

            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return connectRedis(retries - 1);
            }

            console.error('🔥 Redis failed permanently. Operating in restricted mode.');
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
