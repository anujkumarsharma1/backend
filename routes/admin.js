const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Institution = require('../models/Institution');
const Session = require('../models/Session');
const auth = require('../middleware/auth');
const { sendCredentialsEmail } = require('../utils/email');

// All admin routes require admin role
router.use(auth(['admin']));

// ─── GET /api/admin/settings ──────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const institution = await Institution.findOne({ institutionId: req.user.institutionId });
    if (!institution) return res.status(404).json({ error: 'Institution not found' });
    res.json({ institution });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ─── PUT /api/admin/criteria ──────────────────────────────────────────────────
router.put('/criteria', async (req, res) => {
  try {
    const allowed = ['attentionThreshold', 'faceAbsentLimit', 'fatigueWarning', 'driftAlert', 'alertFrequencyLimit', 'alertCooldown', 'driftTolerance'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`criteria.${key}`] = Number(req.body[key]);
    }

    const institution = await Institution.findOneAndUpdate(
      { institutionId: req.user.institutionId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    res.json({ message: 'Criteria updated', criteria: institution.criteria });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update criteria' });
  }
});

// ─── PUT /api/admin/teacher-permissions ───────────────────────────────────────
router.put('/teacher-permissions', async (req, res) => {
  try {
    const { mode, attentionMin, attentionMax, faceAbsentMin, faceAbsentMax } = req.body;
    const institution = await Institution.findOneAndUpdate(
      { institutionId: req.user.institutionId },
      { $set: { teacherPermission: { mode, attentionMin, attentionMax, faceAbsentMin, faceAbsentMax } } },
      { new: true, runValidators: true }
    );
    res.json({ message: 'Teacher permissions updated', teacherPermission: institution.teacherPermission });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update teacher permissions' });
  }
});

// ─── POST /api/admin/teachers ─────────────────────────────────────────────────
router.post('/teachers', async (req, res) => {
  try {
    const { fullName, email, department, password } = req.body;
    if (!fullName || !password) return res.status(400).json({ error: 'fullName and password are required' });

    const teacher = await User.create({
      role: 'teacher',
      fullName,
      email: email?.toLowerCase(),
      department,
      password: password || 'Teacher@123',
      institutionId: req.user.institutionId,
    });

    // Email credentials to teacher if email provided
    if (email) {
      const institution = await Institution.findOne({ institutionId: req.user.institutionId }).lean();
      sendCredentialsEmail({
        to: email.toLowerCase(),
        fullName,
        userId: teacher.userId,
        password: password || 'Teacher@123',
        role: 'teacher',
        institutionName: institution?.name || 'Your Institution',
      }).catch((err) => console.warn('Credentials email failed:', err.message));
    }

    res.status(201).json({
      message: 'Teacher created',
      teacher: { userId: teacher.userId, fullName: teacher.fullName, email: teacher.email, department: teacher.department },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message || 'Failed to create teacher' });
  }
});

// ─── POST /api/admin/students ─────────────────────────────────────────────────
router.post('/students', async (req, res) => {
  try {
    const { fullName, className, rollNumber, password } = req.body;
    if (!fullName) return res.status(400).json({ error: 'fullName is required' });

    const student = await User.create({
      role: 'student',
      fullName,
      className,
      rollNumber,
      password: password || 'Student@123',
      institutionId: req.user.institutionId,
    });

    res.status(201).json({
      message: 'Student created',
      student: { userId: student.userId, fullName: student.fullName, className: student.className, rollNumber: student.rollNumber },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create student' });
  }
});

// ─── POST /api/admin/teachers/bulk ───────────────────────────────────────────
router.post('/teachers/bulk', async (req, res) => {
  try {
    const { teachers } = req.body;
    if (!Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({ error: 'teachers array is required' });
    }

    const created = [];
    const failed = [];

    for (const t of teachers) {
      try {
        const teacher = await User.create({
          role: 'teacher',
          fullName: t.fullName,
          email: t.email?.toLowerCase(),
          department: t.department,
          password: t.password || 'Teacher@123',
          institutionId: req.user.institutionId,
        });
        created.push({ userId: teacher.userId, fullName: teacher.fullName });
      } catch (e) {
        failed.push({ data: t, reason: e.message });
      }
    }

    res.status(201).json({ created, failed, summary: { total: teachers.length, created: created.length, failed: failed.length } });
  } catch (err) {
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// ─── POST /api/admin/students/bulk ───────────────────────────────────────────
router.post('/students/bulk', async (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'students array is required' });
    }

    const created = [];
    const failed = [];

    for (const s of students) {
      try {
        const student = await User.create({
          role: 'student',
          fullName: s.fullName,
          className: s.className,
          rollNumber: s.rollNumber,
          password: s.password || 'Student@123',
          institutionId: req.user.institutionId,
        });
        created.push({ userId: student.userId, fullName: student.fullName });
      } catch (e) {
        failed.push({ data: s, reason: e.message });
      }
    }

    res.status(201).json({ created, failed, summary: { total: students.length, created: created.length, failed: failed.length } });
  } catch (err) {
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// ─── GET /api/admin/teachers ──────────────────────────────────────────────────
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await User.find({ institutionId: req.user.institutionId, role: 'teacher' })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ teachers, count: teachers.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// ─── GET /api/admin/students ──────────────────────────────────────────────────
router.get('/students', async (req, res) => {
  try {
    const students = await User.find({ institutionId: req.user.institutionId, role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ students, count: students.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ─── PATCH /api/admin/users/:id/deactivate ────────────────────────────────────
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { userId: req.params.id, institutionId: req.user.institutionId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `${user.fullName} has been deactivated` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// ─── PATCH /api/admin/users/:id/activate ─────────────────────────────────────
router.patch('/users/:id/activate', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { userId: req.params.id, institutionId: req.user.institutionId },
      { $set: { isActive: true } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `${user.fullName} has been activated` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

// ─── PATCH /api/admin/users/:id/reset-password ────────────────────────────────
router.patch('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ userId: req.params.id, institutionId: req.user.institutionId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword;
    await user.save();

    res.json({ message: `Password reset for ${user.fullName}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── GET /api/admin/sessions ──────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find({ institutionId: req.user.institutionId })
      .select('sessionCode teacherName className subject isActive startedAt endedAt summary')
      .sort({ startedAt: -1 })
      .limit(100)
      .lean();
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

module.exports = router;
