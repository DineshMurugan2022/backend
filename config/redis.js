const { createClient } = require('redis');

let redisClient = null;
let isRedisConnected = false;

/**
 * Initialize Redis client with error handling and reconnection logic
 */
async function initRedis() {
    try {
        redisClient = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            password: process.env.REDIS_PASSWORD || undefined,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('❌ Redis: Max reconnection attempts reached');
                        return new Error('Redis reconnection failed');
                    }
                    const delay = Math.min(retries * 100, 3000);
                    console.log(`🔄 Redis: Reconnecting in ${delay}ms...`);
                    return delay;
                }
            }
        });

        // Event handlers
        redisClient.on('error', (err) => {
            console.error('❌ Redis Client Error:', err.message);
            isRedisConnected = false;
        });

        redisClient.on('connect', () => {
            console.log('🔄 Redis: Connecting...');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis: Connected and ready');
            isRedisConnected = true;
        });

        redisClient.on('reconnecting', () => {
            console.log('🔄 Redis: Reconnecting...');
            isRedisConnected = false;
        });

        redisClient.on('end', () => {
            console.log('⚠️ Redis: Connection closed');
            isRedisConnected = false;
        });

        // Connect to Redis
        await redisClient.connect();

        return redisClient;
    } catch (error) {
        console.error('❌ Redis initialization failed:', error.message);
        console.log('⚠️ Application will continue without Redis caching');
        isRedisConnected = false;
        return null;
    }
}

/**
 * Get Redis client instance
 */
function getRedisClient() {
    return redisClient;
}

/**
 * Check if Redis is connected
 */
function isRedisReady() {
    return isRedisConnected && redisClient && redisClient.isOpen;
}

/**
 * Gracefully close Redis connection
 */
async function closeRedis() {
    if (redisClient && redisClient.isOpen) {
        try {
            await redisClient.quit();
            console.log('✅ Redis: Connection closed gracefully');
        } catch (error) {
            console.error('❌ Redis: Error closing connection:', error.message);
        }
    }
}

/**
 * Get cached data
 */
async function getCache(key) {
    if (!isRedisReady()) return null;

    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`❌ Redis GET error for key ${key}:`, error.message);
        return null;
    }
}

/**
 * Set cached data with TTL
 */
async function setCache(key, value, ttl = 300) {
    if (!isRedisReady()) return false;

    try {
        await redisClient.setEx(key, ttl, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`❌ Redis SET error for key ${key}:`, error.message);
        return false;
    }
}

/**
 * Delete cached data
 */
async function deleteCache(key) {
    if (!isRedisReady()) return false;

    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error(`❌ Redis DEL error for key ${key}:`, error.message);
        return false;
    }
}

/**
 * Delete all keys matching a pattern
 */
async function deleteCachePattern(pattern) {
    if (!isRedisReady()) return false;

    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        return true;
    } catch (error) {
        console.error(`❌ Redis pattern delete error for ${pattern}:`, error.message);
        return false;
    }
}

/**
 * Clear all cache
 */
async function clearAllCache() {
    if (!isRedisReady()) return false;

    try {
        await redisClient.flushDb();
        console.log('✅ Redis: All cache cleared');
        return true;
    } catch (error) {
        console.error('❌ Redis: Error clearing cache:', error.message);
        return false;
    }
}

module.exports = {
    initRedis,
    getRedisClient,
    isRedisReady,
    closeRedis,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern,
    clearAllCache
};
