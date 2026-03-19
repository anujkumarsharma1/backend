const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Institution = require('../models/Institution');
const auth = require('../middleware/auth');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/email');

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── POST /api/auth/register-institution ─────────────────────────────────────
router.post('/register-institution', async (req, res) => {
  try {
    const { institutionName, adminName, email, password, enabledFeatures } = req.body;
    if (!institutionName || !adminName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Create institution first
    const institution = await Institution.create({
      name: institutionName,
      adminName,
      email: email.toLowerCase(),
      enabledFeatures: enabledFeatures || ['drowsiness', 'blink', 'headPose', 'pupil', 'expression'],
    });

    // Create admin user
    const admin = await User.create({
      role: 'admin',
      fullName: adminName,
      email: email.toLowerCase(),
      password,
      institutionId: institution.institutionId,
      userId: `${institution.institutionId.replace(/-/g, '')}-ADM-001`,
    });

    const token = signToken({
      userId: admin.userId,
      role: admin.role,
      institutionId: institution.institutionId,
      fullName: admin.fullName,
      email: admin.email,
    });

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcomeEmail({
      to: admin.email,
      fullName: admin.fullName,
      institutionName: institution.name,
      userId: admin.userId,
    }).catch((err) => console.warn('Welcome email failed:', err.message));

    res.status(201).json({
      message: 'Institution registered successfully',
      token,
      user: {
        userId: admin.userId,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        institutionId: institution.institutionId,
      },
      institution: {
        institutionId: institution.institutionId,
        name: institution.name,
        enabledFeatures: institution.enabledFeatures,
      },
    });
  } catch (err) {
    console.error('register-institution error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/admin-login ───────────────────────────────────────────────
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: 'admin' }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const institution = await Institution.findOne({ institutionId: user.institutionId });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken({
      userId: user.userId,
      role: user.role,
      institutionId: user.institutionId,
      fullName: user.fullName,
      email: user.email,
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
      },
      institution: institution
        ? { institutionId: institution.institutionId, name: institution.name, enabledFeatures: institution.enabledFeatures }
        : null,
    });
  } catch (err) {
    console.error('admin-login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/login (Teacher / Student) ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { userId, password, role } = req.body;
    if (!userId || !password || !role) {
      return res.status(400).json({ error: 'userId, password, and role are required' });
    }
    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Role must be teacher or student' });
    }

    const user = await User.findOne({
      userId: userId.trim().toUpperCase(),
      role,
    }).select('+password');

    if (!user) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    const institution = await Institution.findOne({ institutionId: user.institutionId });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken({
      userId: user.userId,
      role: user.role,
      institutionId: user.institutionId,
      fullName: user.fullName,
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        className: user.className,
        department: user.department,
      },
      institution: institution
        ? { institutionId: institution.institutionId, name: institution.name, enabledFeatures: institution.enabledFeatures }
        : null,
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth(), async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const institution = await Institution.findOne({ institutionId: user.institutionId }).lean();

    res.json({
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        isActive: user.isActive,
        className: user.className,
        department: user.department,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
      institution: institution
        ? { institutionId: institution.institutionId, name: institution.name, enabledFeatures: institution.enabledFeatures, criteria: institution.criteria }
        : null,
    });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return 200 to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    // Send reset email (non-blocking)
    sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl,
    }).catch((err) => console.warn('Reset email failed:', err.message));

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. Please log in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
