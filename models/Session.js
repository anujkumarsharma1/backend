const mongoose = require('mongoose');

const attentionSampleSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  attention: { type: Number, min: 0, max: 100 },
  expression: String,
  headPose: {
    pitch: Number,
    yaw: Number,
    roll: Number,
  },
}, { _id: false });

const studentSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: Date,
  attentionSamples: [attentionSampleSchema],
  warningCount: { type: Number, default: 0 },
  multiFaceCount: { type: Number, default: 0 },
  latestData: { type: mongoose.Schema.Types.Mixed },
  avgAttention: { type: Number },
}, { _id: false });

const criteriaSchema = new mongoose.Schema({
  attentionThreshold: { type: Number, default: 60 },
  faceAbsentLimit: { type: Number, default: 10 },
  fatigueWarning: { type: Number, default: 3 },
  driftAlert: { type: Number, default: 15 },
  alertFrequencyLimit: { type: Number, default: 3 },
  alertCooldown: { type: Number, default: 30 },
  driftTolerance: { type: Number, default: 20 },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  teacherId: { type: String, required: true },
  teacherName: { type: String, required: true },
  institutionId: { type: String, required: true },
  className: { type: String, trim: true },
  subject: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
  criteria: { type: criteriaSchema, default: () => ({}) },
  students: [studentSessionSchema],
  summary: {
    totalStudents: { type: Number, default: 0 },
    avgAttention: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    totalAlerts: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

// Indexes
sessionSchema.index({ sessionCode: 1 });
sessionSchema.index({ teacherId: 1, startedAt: -1 });
sessionSchema.index({ institutionId: 1, startedAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
