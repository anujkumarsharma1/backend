const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const Institution = require('../models/Institution');
const auth = require('../middleware/auth');

// Generate unique 6-char alphanumeric session code
const generateSessionCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars
};

// ─── POST /api/sessions/create ────────────────────────────────────────────────
router.post('/create', auth(['teacher']), async (req, res) => {
  try {
    const { className, subject } = req.body;
    const [teacher, institution] = await Promise.all([
      User.findOne({ userId: req.user.userId }).lean(),
      Institution.findOne({ institutionId: req.user.institutionId }).lean(),
    ]);
    if (!institution) return res.status(404).json({ error: 'Institution not found' });

    // Merge criteria
    const orgCriteria = institution.criteria || {};
    const override = teacher?.criteriaOverride || {};
    const mode = institution.teacherPermission?.mode || 'locked';
    const effectiveCriteria = mode === 'locked' ? { ...orgCriteria } : { ...orgCriteria, ...override };

    // Generate unique code
    let sessionCode;
    let attempts = 0;
    do {
      sessionCode = generateSessionCode();
      const existing = await Session.findOne({ sessionCode });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const session = await Session.create({
      sessionCode,
      teacherId: req.user.userId,
      teacherName: teacher?.fullName || req.user.fullName,
      institutionId: req.user.institutionId,
      className: className || '',
      subject: subject || '',
      criteria: effectiveCriteria,
    });

    res.status(201).json({
      message: 'Session created',
      session: {
        sessionCode: session.sessionCode,
        className: session.className,
        subject: session.subject,
        criteria: session.criteria,
        startedAt: session.startedAt,
        isActive: session.isActive,
      },
    });
  } catch (err) {
    console.error('create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ─── GET /api/sessions/validate/:code ────────────────────────────────────────
router.get('/validate/:code', auth(['student', 'teacher']), async (req, res) => {
  try {
    const session = await Session.findOne({
      sessionCode: req.params.code.toUpperCase(),
      isActive: true,
    }).select('sessionCode className subject teacherName criteria startedAt').lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found or has ended' });
    }
    res.json({ valid: true, session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to validate session' });
  }
});

// ─── POST /api/sessions/:code/end ─────────────────────────────────────────────
router.post('/:code/end', auth(['teacher']), async (req, res) => {
  try {
    const session = await Session.findOne({
      sessionCode: req.params.code.toUpperCase(),
      teacherId: req.user.userId,
      isActive: true,
    });

    if (!session) return res.status(404).json({ error: 'Active session not found' });

    const endedAt = new Date();
    const durationMinutes = Math.round((endedAt - session.startedAt) / 60000);

    // Calculate summary
    let totalAttention = 0;
    let attentionCount = 0;
    let totalAlerts = 0;

    session.students.forEach((s) => {
      s.attentionSamples.forEach((sample) => {
        if (sample.attention !== undefined) {
          totalAttention += sample.attention;
          attentionCount++;
        }
      });
      totalAlerts += s.warningCount + s.multiFaceCount;
      // Calculate per-student avg
      s.avgAttention = s.attentionSamples.length
        ? Math.round(s.attentionSamples.reduce((acc, x) => acc + (x.attention || 0), 0) / s.attentionSamples.length)
        : 0;
    });

    session.isActive = false;
    session.endedAt = endedAt;
    session.summary = {
      totalStudents: session.students.length,
      avgAttention: attentionCount > 0 ? Math.round(totalAttention / attentionCount) : 0,
      durationMinutes,
      totalAlerts,
    };
    await session.save();

    // Notify connected students via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${session.sessionCode}`).emit('session:ended', {
        sessionCode: session.sessionCode,
        summary: session.summary,
      });
    }

    res.json({ message: 'Session ended', summary: session.summary });
  } catch (err) {
    console.error('end session error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// ─── GET /api/sessions/my-sessions ───────────────────────────────────────────
router.get('/my-sessions', auth(['teacher']), async (req, res) => {
  try {
    const sessions = await Session.find({ teacherId: req.user.userId })
      .select('sessionCode className subject isActive startedAt endedAt summary')
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ─── GET /api/sessions/:code/report ──────────────────────────────────────────
router.get('/:code/report', auth(['teacher', 'admin']), async (req, res) => {
  try {
    const session = await Session.findOne({
      sessionCode: req.params.code.toUpperCase(),
      institutionId: req.user.institutionId,
    }).lean();

    if (!session) return res.status(404).json({ error: 'Session not found' });

    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

module.exports = router;
