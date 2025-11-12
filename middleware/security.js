const rateLimit = require('express-rate-limit');
const xss = require('xss');

// Rate limiting middleware
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// XSS sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  for (const key in req.query) {
    if (typeof req.query[key] === 'string') {
      req.query[key] = xss(req.query[key]);
    }
  }
  
  // Sanitize body parameters
  for (const key in req.body) {
    if (typeof req.body[key] === 'string') {
      req.body[key] = xss(req.body[key]);
    }
  }
  
  // Sanitize URL parameters
  for (const key in req.params) {
    if (typeof req.params[key] === 'string') {
      req.params[key] = xss(req.params[key]);
    }
  }
  
  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

module.exports = {
  createRateLimiter,
  sanitizeInput,
  securityHeaders
};