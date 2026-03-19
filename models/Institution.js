const mongoose = require('mongoose');

const criteriaSchema = new mongoose.Schema({
  attentionThreshold: { type: Number, default: 60, min: 0, max: 100 },
  faceAbsentLimit: { type: Number, default: 10, min: 1, max: 60 },
  fatigueWarning: { type: Number, default: 3, min: 1, max: 20 },
  driftAlert: { type: Number, default: 15, min: 5, max: 120 },
  alertFrequencyLimit: { type: Number, default: 3 },
  alertCooldown: { type: Number, default: 30 },
  driftTolerance: { type: Number, default: 20 },
}, { _id: false });

const teacherPermissionSchema = new mongoose.Schema({
  mode: { type: String, enum: ['locked', 'partial', 'full'], default: 'partial' },
  attentionMin: { type: Number, default: 40 },
  attentionMax: { type: Number, default: 90 },
  faceAbsentMin: { type: Number, default: 5 },
  faceAbsentMax: { type: Number, default: 30 },
}, { _id: false });

const institutionSchema = new mongoose.Schema({
  institutionId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Institution name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
  },
  adminName: {
    type: String,
    required: [true, 'Admin name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  criteria: { type: criteriaSchema, default: () => ({}) },
  teacherPermission: { type: teacherPermissionSchema, default: () => ({}) },
  enabledFeatures: {
    type: [String],
    default: ['drowsiness', 'blink', 'headPose', 'pupil', 'expression'],
  },
  isActive: { type: Boolean, default: true },
  plan: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
}, {
  timestamps: true,
});

// Auto-generate institutionId before save
institutionSchema.pre('validate', async function (next) {
  if (!this.isNew) return next();
  const count = await mongoose.model('Institution').countDocuments();
  this.institutionId = `INST-${String(count + 1).padStart(3, '0')}`;
  next();
});

module.exports = mongoose.model('Institution', institutionSchema);
