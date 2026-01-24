const rateLimit = require('express-rate-limit');
const { getRedisClient, isRedisReady } = require('../config/redis');

// Flag to log Redis warning only once
let redisWarningLogged = false;

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

            if (!redisWarningLogged) {
                console.log('✅ Rate limiter using Redis store');
                redisWarningLogged = true;
            }
        } catch (error) {
            if (!redisWarningLogged) {
                console.log('⚠️ Rate limiter using memory store (Redis store unavailable)');
                redisWarningLogged = true;
            }
        }
    } else {
        if (!redisWarningLogged) {
            console.log('⚠️ Rate limiter using memory store (Redis not connected)');
            redisWarningLogged = true;
        }
    }

    return rateLimit(defaultOptions);
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Increased from 5 to 20
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
    max: 1000, // Increased from 100 to 1000 for rich dashboard usage
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
