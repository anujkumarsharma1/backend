const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

const setupSocketHandlers = (io) => {
  // ─── JWT Auth Middleware for Socket ──────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // Track teacher sockets: sessionCode → socketId
  const teacherSockets = new Map();
  // Track student sockets: socketId → { sessionCode, userId }
  const studentSessions = new Map();

  io.on('connection', (socket) => {
    const { userId, role, fullName } = socket.user;
    console.log(`🔌 ${role} connected: ${fullName} (${userId}) [${socket.id}]`);

    // ─── TEACHER: Join Session Room ────────────────────────────────────────
    socket.on('teacher:join-session', async ({ sessionCode }) => {
      try {
        const session = await Session.findOne({ sessionCode, isActive: true });
        if (!session) {
          socket.emit('error', { message: 'Session not found or not active' });
          return;
        }
        socket.join(`session:${sessionCode}`);
        teacherSockets.set(sessionCode, socket.id);

        // Send current student list to teacher
        const activeStudents = session.students
          .filter((s) => !s.leftAt)
          .map((s) => ({
            userId: s.userId,
            fullName: s.fullName,
            joinedAt: s.joinedAt,
            latestData: s.latestData || null,
          }));

        socket.emit('session:active-students', { students: activeStudents, session });
        console.log(`🏫 Teacher ${fullName} joined session ${sessionCode}`);
      } catch (err) {
        console.error('teacher:join-session error:', err);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // ─── STUDENT: Join Session ─────────────────────────────────────────────
    socket.on('student:join-session', async ({ sessionCode }) => {
      try {
        const session = await Session.findOne({ sessionCode, isActive: true });
        if (!session) {
          socket.emit('error', { message: 'Session not found or already ended' });
          return;
        }

        socket.join(`session:${sessionCode}`);
        studentSessions.set(socket.id, { sessionCode, userId });

        // Add or update student in session
        const existing = session.students.find((s) => s.userId === userId);
        if (!existing) {
          session.students.push({
            userId,
            fullName,
            joinedAt: new Date(),
            attentionSamples: [],
            warningCount: 0,
            multiFaceCount: 0,
          });
          await session.save();
        } else {
          existing.leftAt = undefined;
          await session.save();
        }

        // Notify teacher
        const teacherSocketId = teacherSockets.get(sessionCode);
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student:joined', {
            userId,
            fullName,
            joinedAt: new Date(),
          });
        }

        // Send criteria to student
        socket.emit('session:criteria', { criteria: session.criteria, sessionCode });
        console.log(`🎓 Student ${fullName} joined session ${sessionCode}`);
      } catch (err) {
        console.error('student:join-session error:', err);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // ─── STUDENT: Send Attention Data ──────────────────────────────────────
    let dataEmitCount = 0;
    socket.on('student:data', async ({ sessionCode, data }) => {
      try {
        const teacherSocketId = teacherSockets.get(sessionCode);
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student:update', {
            userId,
            fullName,
            data,
            timestamp: Date.now(),
          });
        }

        // Write to DB every 10th emit (~20 seconds)
        dataEmitCount++;
        if (dataEmitCount % 10 === 0) {
          await Session.updateOne(
            { sessionCode, 'students.userId': userId },
            {
              $push: {
                'students.$.attentionSamples': {
                  timestamp: new Date(),
                  attention: data.attention,
                  expression: data.expression,
                  headPose: data.headPose,
                },
              },
              $set: { 'students.$.latestData': data },
            }
          );
        }
      } catch (err) {
        console.error('student:data error:', err);
      }
    });

    // ─── STUDENT: Face Lost/Found ──────────────────────────────────────────
    socket.on('student:face-lost', ({ sessionCode }) => {
      const teacherSocketId = teacherSockets.get(sessionCode);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit('student:face-lost', { userId, fullName, timestamp: Date.now() });
      }
    });

    socket.on('student:face-found', ({ sessionCode }) => {
      const teacherSocketId = teacherSockets.get(sessionCode);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit('student:face-found', { userId, fullName, timestamp: Date.now() });
      }
    });

    // ─── TEACHER: Nudge Student ────────────────────────────────────────────
    socket.on('teacher:nudge-student', ({ sessionCode, targetUserId, message }) => {
      // Find target student's socket
      for (const [sid, info] of studentSessions.entries()) {
        if (info.sessionCode === sessionCode && info.userId === targetUserId) {
          io.to(sid).emit('teacher:nudge', {
            message: message || 'Your teacher is asking for your attention!',
            timestamp: Date.now(),
          });
          break;
        }
      }
    });

    // ─── MULTI-FACE ALERT ─────────────────────────────────────────────────
    socket.on('student:multi-face', async ({ sessionCode, count }) => {
      const teacherSocketId = teacherSockets.get(sessionCode);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit('student:multi-face', { userId, fullName, count, timestamp: Date.now() });
      }
      // Increment counter in DB
      await Session.updateOne(
        { sessionCode, 'students.userId': userId },
        { $inc: { 'students.$.multiFaceCount': 1 } }
      ).catch(() => {});
    });

    // ─── DISCONNECT ────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔌 ${role} disconnected: ${fullName} [${socket.id}]`);

      if (role === 'teacher') {
        // Notify students teacher disconnected
        for (const [code, sid] of teacherSockets.entries()) {
          if (sid === socket.id) {
            io.to(`session:${code}`).emit('teacher:disconnected', { message: 'Teacher has disconnected' });
            teacherSockets.delete(code);
            break;
          }
        }
      } else if (role === 'student') {
        const info = studentSessions.get(socket.id);
        if (info) {
          const { sessionCode } = info;
          studentSessions.delete(socket.id);

          // Mark student leftAt in DB
          await Session.updateOne(
            { sessionCode, 'students.userId': userId },
            { $set: { 'students.$.leftAt': new Date() } }
          ).catch(() => {});

          // Notify teacher
          const teacherSocketId = teacherSockets.get(sessionCode);
          if (teacherSocketId) {
            io.to(teacherSocketId).emit('student:left', { userId, fullName, timestamp: Date.now() });
          }
        }
      }
    });
  });
};

module.exports = setupSocketHandlers;
