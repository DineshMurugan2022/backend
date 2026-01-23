const rateLimit = require('express-rate-limit');
const { getRedisClient, isRedisReady } = require('../config/redis');

/**
 * Create rate limiter with Redis store if available, otherwise use memory store
 */
function createRateLimiter(options) {
    const defaultOptions = {
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message: 'Too many requests, please try again later.',
                retryAfter: req.rateLimit.resetTime
            });
        },
        ...options
    };

    // If Redis is available, use Redis store
    if (isRedisReady()) {
        try {
            const RedisStore = require('rate-limit-redis');
            const redisClient = getRedisClient();

            defaultOptions.store = new RedisStore({
                client: redisClient,
                prefix: 'rl:', // Rate limit prefix
            });

            console.log('✅ Rate limiter using Redis store');
        } catch (error) {
            console.log('⚠️ Rate limiter using memory store (Redis store unavailable)');
        }
    } else {
        console.log('⚠️ Rate limiter using memory store (Redis not connected)');
    }

    return rateLimit(defaultOptions);
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
    skipSuccessfulRequests: false, // Count successful requests
    skipFailedRequests: false, // Count failed requests
});

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    skipSuccessfulRequests: false,
});

/**
 * File upload rate limiter
 * 10 requests per hour
 */
const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 uploads per hour
    message: 'Too many file uploads from this IP, please try again later',
    skipSuccessfulRequests: false,
});

/**
 * Moderate rate limiter for sensitive operations
 * 20 requests per 15 minutes
 */
const moderateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Too many requests, please slow down',
});

/**
 * Lenient rate limiter for read operations
 * 200 requests per 15 minutes
 */
const readLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: 'Too many requests, please try again later',
    skipSuccessfulRequests: true, // Don't count successful requests
});

module.exports = {
    authLimiter,
    apiLimiter,
    uploadLimiter,
    moderateLimiter,
    readLimiter,
    createRateLimiter
};
