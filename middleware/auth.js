const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Auth middleware factory
 * @param {string[]} [roles] - Allowed roles. If empty, any authenticated user passes.
 */
const auth = (roles = []) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch fresh user from DB (check isActive, etc.)
      const user = await User.findOne({ userId: decoded.userId }).lean();
      if (!user && decoded.role !== 'admin') {
        return res.status(401).json({ error: 'User not found' });
      }

      // Allow admin by email lookup if userId lookup fails
      let currentUser = user;
      if (!currentUser && decoded.role === 'admin') {
        const { User: UserModel } = require('../models/User');
        currentUser = await UserModel.findOne({ email: decoded.email, role: 'admin' }).lean();
      }

      if (currentUser && !currentUser.isActive) {
        return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
      }

      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      }

      req.user = { ...decoded, ...(currentUser || {}) };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token has expired. Please log in again.' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      console.error('Auth middleware error:', err);
      res.status(500).json({ error: 'Authentication error' });
    }
  };
};

module.exports = auth;
