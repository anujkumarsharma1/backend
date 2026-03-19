const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Institution = require('../models/Institution');
const auth = require('../middleware/auth');

router.use(auth(['teacher']));

// ─── GET /api/teacher/criteria ────────────────────────────────────────────────
router.get('/criteria', async (req, res) => {
  try {
    const [teacher, institution] = await Promise.all([
      User.findOne({ userId: req.user.userId }).lean(),
      Institution.findOne({ institutionId: req.user.institutionId }).lean(),
    ]);
    if (!institution) return res.status(404).json({ error: 'Institution not found' });

    const orgCriteria = institution.criteria;
    const override = teacher?.criteriaOverride || {};
    const mode = institution.teacherPermission?.mode || 'locked';

    let effective = { ...orgCriteria };
    if (mode !== 'locked' && Object.keys(override).length > 0) {
      effective = { ...orgCriteria, ...override };
    }

    res.json({ effective, orgCriteria, override, mode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch criteria' });
  }
});

// ─── PUT /api/teacher/criteria ────────────────────────────────────────────────
router.put('/criteria', async (req, res) => {
  try {
    const institution = await Institution.findOne({ institutionId: req.user.institutionId }).lean();
    if (!institution) return res.status(404).json({ error: 'Institution not found' });

    const mode = institution.teacherPermission?.mode || 'locked';
    if (mode === 'locked') {
      return res.status(403).json({ error: 'Your institution has locked AI criteria settings' });
    }

    const { attentionThreshold, faceAbsentLimit, fatigueWarning, driftAlert } = req.body;
    let override = {};

    if (mode === 'partial') {
      const { attentionMin, attentionMax, faceAbsentMin, faceAbsentMax } = institution.teacherPermission;
      if (attentionThreshold !== undefined) override.attentionThreshold = Math.min(Math.max(Number(attentionThreshold), attentionMin), attentionMax);
      if (faceAbsentLimit !== undefined) override.faceAbsentLimit = Math.min(Math.max(Number(faceAbsentLimit), faceAbsentMin), faceAbsentMax);
      if (fatigueWarning !== undefined) override.fatigueWarning = Number(fatigueWarning);
      if (driftAlert !== undefined) override.driftAlert = Number(driftAlert);
    } else {
      // full mode
      if (attentionThreshold !== undefined) override.attentionThreshold = Number(attentionThreshold);
      if (faceAbsentLimit !== undefined) override.faceAbsentLimit = Number(faceAbsentLimit);
      if (fatigueWarning !== undefined) override.fatigueWarning = Number(fatigueWarning);
      if (driftAlert !== undefined) override.driftAlert = Number(driftAlert);
    }

    await User.updateOne({ userId: req.user.userId }, { $set: { criteriaOverride: override } });
    res.json({ message: 'Criteria updated', override });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update criteria' });
  }
});

module.exports = router;
