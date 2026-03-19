const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const criteriaOverrideSchema = new mongoose.Schema({
  attentionThreshold: Number,
  faceAbsentLimit: Number,
  fatigueWarning: Number,
  driftAlert: Number,
}, { _id: false });

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    sparse: true,
  },
  role: {
    type: String,
    enum: ['admin', 'teacher', 'student'],
    required: [true, 'Role is required'],
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Never return password in queries by default
  },
  institutionId: {
    type: String,
    required: [true, 'Institution ID is required'],
  },
  department: { type: String, trim: true },
  className: { type: String, trim: true },
  rollNumber: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  criteriaOverride: { type: criteriaOverrideSchema, default: null },
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: { type: String, select: false },
  emailVerifyExpires: { type: Date, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  lastLogin: { type: Date },
}, {
  timestamps: true,
});

// ─── Auto-generate userId ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  // Generate userId for new teacher/student
  if (this.isNew && this.role !== 'admin' && !this.userId) {
    const roleCode = this.role === 'teacher' ? 'TCH' : 'STD';
    // Strip dashes from institutionId for prefix: INST-001 → INST001
    const instPrefix = this.institutionId.replace(/-/g, '');
    const count = await mongoose.model('User').countDocuments({
      institutionId: this.institutionId,
      role: this.role,
    });
    this.userId = `${instPrefix}-${roleCode}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

// ─── Hash password ─────────────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Compare password ──────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Indexes ───────────────────────────────────────────────────────────────
userSchema.index({ institutionId: 1, role: 1 });
userSchema.index({ email: 1 }, { sparse: true });
userSchema.index({ userId: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
