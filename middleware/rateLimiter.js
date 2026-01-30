const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { pubClient, connectRedis } = require('../services/redis');

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Enhanced createRateLimiter with Redis fallback to memory store
 * Automatically falls back to in-memory store when Redis is unavailable
 */
function createRateLimiter(options) {
    const { prefix, ...rateLimitConfig } = options;

    let store;
    let usingMemoryStore = false;

    // Try to use Redis store, fall back to memory store if unavailable
    try {
        if (pubClient && pubClient.isOpen && pubClient.isReady) {
            store = new RedisStore({
                sendCommand: async (...args) => {
                    try {
                        // Ensure Redis is still connected
                        if (!pubClient.isOpen || !pubClient.isReady) {
                            console.warn(`⚠️ Redis disconnected during rate limiting (${prefix})`);
                            return null;
                        }
                        return await pubClient.sendCommand(args);
                    } catch (cmdErr) {
                        console.error(`❌ Redis Rate Limit Command Error (${prefix}):`, cmdErr.message);
                        return null;
                    }
                },
                prefix: prefix || 'rl:',
            });
            console.log(`✅ Rate limiter "${prefix || 'default'}" using Redis store`);
        } else {
            usingMemoryStore = true;
            console.warn(`⚠️ Redis not available. Rate limiter "${prefix || 'default'}" using memory store (not distributed)`);
        }
    } catch (err) {
        usingMemoryStore = true;
        console.warn(`⚠️ Failed to create Redis store for "${prefix || 'default'}". Using memory store:`, err.message);
    }

    return rateLimit({
        store: usingMemoryStore ? undefined : store, // undefined = use default memory store
        windowMs: rateLimitConfig.windowMs || 15 * 60 * 1000,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            const retryAfter = Math.ceil(req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000 || rateLimitConfig.windowMs / 1000;
            console.warn(`🚫 Rate limit exceeded for ${req.ip} on ${req.path}`);
            res.status(429).json({
                success: false,
                message: options.message || 'Too many requests, please try again later.',
                retryAfter: Math.ceil(retryAfter)
            });
        },
        skip: (req) => {
            // Skip rate limiting for OPTIONS (CORS preflight) and health checks
            return req.method === 'OPTIONS' || req.path === '/api/health';
        },
        ...rateLimitConfig
    });
}

/**
 * Strict rate limiter for authentication endpoints
 * Development: 100 requests per 15 minutes
 * Production: 50 requests per 15 minutes
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 50, // More lenient in development
    message: isDevelopment
        ? 'Too many login attempts, please try again in a few minutes'
        : 'Too many login attempts, please try again after 15 minutes',
    prefix: 'rl:auth:'
});

/**
 * General API rate limiter
 * Development: 2000 requests per 15 minutes
 * Production: 1000 requests per 15 minutes
 */
const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isDevelopment ? 2000 : 1000,
    prefix: 'rl:api:'
});

/**
 * File upload rate limiter
 * Development: 20 uploads per hour
 * Production: 10 uploads per hour
 */
const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 20 : 10,
    message: 'Too many file uploads, please try again later',
    prefix: 'rl:upload:'
});

/**
 * Moderate rate limiter for sensitive operations
 */
const moderateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isDevelopment ? 100 : 50,
    prefix: 'rl:moderate:'
});

/**
 * Lenient rate limiter for read operations
 */
const readLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: isDevelopment ? 500 : 200,
    skipSuccessfulRequests: true,
    prefix: 'rl:read:'
});

module.exports = {
    authLimiter,
    apiLimiter,
    uploadLimiter,
    moderateLimiter,
    readLimiter,
    createRateLimiter
};
