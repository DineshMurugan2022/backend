const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from cookie first, then fallback to Authorization header
    let token = req.cookies?.token;

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      token = req.header('Authorization')?.replace('Bearer ', '');
    }

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    if (!process.env.JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET is not defined in environment variables.');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by ID from token
    const user = await User.findById(decoded.id || decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.warn('Auth middleware: Token has expired');
      return res.status(401).json({ message: 'Token has expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      console.warn('Auth middleware: Invalid token');
      return res.status(401).json({ message: 'Token is not valid' });
    }

    console.error('Auth middleware error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = auth;