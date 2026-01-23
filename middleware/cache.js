const { getCache, setCache, deleteCache, deleteCachePattern } = require('../config/redis');

/**
 * Generate cache key from request
 */
function generateCacheKey(req) {
    const { path, query, user } = req;
    const userId = user?._id || 'anonymous';
    const queryString = JSON.stringify(query);
    return `cache:${path}:${userId}:${queryString}`;
}

/**
 * Cache middleware for GET requests
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 */
function cacheMiddleware(ttl = 300) {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        const cacheKey = generateCacheKey(req);

        try {
            // Try to get cached data
            const cachedData = await getCache(cacheKey);

            if (cachedData) {
                console.log(`✅ Cache HIT: ${cacheKey}`);
                return res.json(cachedData);
            }

            console.log(`⚠️ Cache MISS: ${cacheKey}`);

            // Store original res.json function
            const originalJson = res.json.bind(res);

            // Override res.json to cache the response
            res.json = function (data) {
                // Cache the response
                setCache(cacheKey, data, ttl).catch(err => {
                    console.error('Cache SET error:', err.message);
                });

                // Call original json function
                return originalJson(data);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error.message);
            next();
        }
    };
}

/**
 * Invalidate cache for a specific pattern
 */
async function invalidateCache(pattern) {
    try {
        await deleteCachePattern(pattern);
        console.log(`✅ Cache invalidated: ${pattern}`);
    } catch (error) {
        console.error('Cache invalidation error:', error.message);
    }
}

/**
 * Middleware to invalidate cache after POST/PUT/DELETE operations
 */
function invalidateCacheMiddleware(patterns) {
    return async (req, res, next) => {
        // Store original send functions
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        // Override response functions
        const invalidateAndRespond = (data, originalFn) => {
            // Only invalidate on successful operations (2xx status codes)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Invalidate cache patterns
                const patternsToInvalidate = Array.isArray(patterns) ? patterns : [patterns];

                patternsToInvalidate.forEach(pattern => {
                    invalidateCache(pattern).catch(err => {
                        console.error(`Failed to invalidate cache for ${pattern}:`, err.message);
                    });
                });
            }

            return originalFn(data);
        };

        res.json = function (data) {
            return invalidateAndRespond(data, originalJson);
        };

        res.send = function (data) {
            return invalidateAndRespond(data, originalSend);
        };

        next();
    };
}

/**
 * Helper to invalidate specific resource cache
 */
function invalidateResourceCache(resourceName) {
    return invalidateCacheMiddleware([
        `cache:/api/${resourceName}*`,
        `cache:/api/${resourceName}/*`
    ]);
}

/**
 * Clear all cache endpoint handler
 */
async function clearCacheHandler(req, res) {
    try {
        const { clearAllCache } = require('../config/redis');
        await clearAllCache();
        res.json({
            success: true,
            message: 'All cache cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to clear cache',
            error: error.message
        });
    }
}

module.exports = {
    cacheMiddleware,
    invalidateCache,
    invalidateCacheMiddleware,
    invalidateResourceCache,
    clearCacheHandler,
    generateCacheKey
};
