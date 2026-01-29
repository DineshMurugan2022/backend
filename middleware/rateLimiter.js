const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { pubClient } = require('../services/redis');

/**
 * Simplified createRateLimiter using only memory store
 */
function createRateLimiter(options) {
    const { prefix, ...rateLimitConfig } = options;
    return rateLimit({
        // Use Redis store for distributed rate limiting
        store: new RedisStore({
            sendCommand: async (...args) => {
                // node-redis v4 will queue commands if the client is connecting
                // but we check isOpen to ensure we've at least started the connection
                if (!pubClient.isOpen) {
                    await pubClient.connect().catch(() => { });
                }
                return pubClient.sendCommand(args);
            },
            prefix: prefix || 'rl:',
        }),
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message: options.message || 'Too many requests, please try again later.',
                retryAfter: req.rateLimit?.resetTime
            });
        },
        ...rateLimitConfig
    });
}

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many login attempts, please try again after 15 minutes'
});

/**
 * General API rate limiter
 */
const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 1000
});

/**
 * File upload rate limiter
 */
const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10
});

/**
 * Moderate rate limiter for sensitive operations
 */
const moderateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20
});

/**
 * Lenient rate limiter for read operations
 */
const readLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 200,
    skipSuccessfulRequests: true
});

module.exports = {
    authLimiter,
    apiLimiter,
    uploadLimiter,
    moderateLimiter,
    readLimiter,
    createRateLimiter
};
