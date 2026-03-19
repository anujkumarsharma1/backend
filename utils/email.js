const nodemailer = require('nodemailer');

// Create Gmail transporter
const createTransporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail credentials not set. Add GMAIL_USER and GMAIL_APP_PASSWORD to your .env file.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD, // 16-char App Password, NOT your Gmail password
    },
  });
};

// ─── Send password reset email ────────────────────────────────────────────────
const sendPasswordResetEmail = async ({ to, fullName, resetUrl }) => {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: #6366f1; padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }
        .body { padding: 32px; }
        .body p { color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
        .btn { display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0 24px; }
        .note { background: #f1f5f9; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #64748b; }
        .footer { padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>ClassroomIQ</h1>
          <p>AI-Powered Attention Monitoring</p>
        </div>
        <div class="body">
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>We received a request to reset your ClassroomIQ password. Click the button below to set a new password:</p>
          <div style="text-align:center;">
            <a href="${resetUrl}" class="btn">Reset My Password</a>
          </div>
          <div class="note">
            ⏱ This link expires in <strong>1 hour</strong>.<br/>
            If you did not request a password reset, you can safely ignore this email — your password will not change.
          </div>
          <p style="margin-top:20px; font-size:13px; color:#94a3b8;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <span style="color:#6366f1; word-break:break-all;">${resetUrl}</span>
          </p>
        </div>
        <div class="footer">ClassroomIQ &nbsp;·&nbsp; This is an automated email, please do not reply.</div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"ClassroomIQ" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your ClassroomIQ password',
    html,
  });
};

// ─── Send welcome / registration confirmation email ───────────────────────────
const sendWelcomeEmail = async ({ to, fullName, institutionName, userId }) => {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: #6366f1; padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }
        .body { padding: 32px; }
        .body p { color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #64748b; }
        .info-value { color: #1e293b; font-weight: 600; font-family: monospace; }
        .btn { display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .footer { padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Welcome to ClassroomIQ 🎉</h1>
          <p>Your institution is ready</p>
        </div>
        <div class="body">
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>Your institution <strong>${institutionName}</strong> has been successfully registered on ClassroomIQ. Here are your account details:</p>
          <div class="info-box">
            ${userId ? `<div class="info-row"><span class="info-label">User ID</span><span class="info-value">${userId}</span></div>` : ''}
            <div class="info-row"><span class="info-label">Institution</span><span class="info-value">${institutionName}</span></div>
            <div class="info-row"><span class="info-label">Role</span><span class="info-value">Administrator</span></div>
            <div class="info-row"><span class="info-label">Login Email</span><span class="info-value">${to}</span></div>
          </div>
          <p>You can now log in and start adding teachers and students.</p>
          <div style="text-align:center; margin: 24px 0;">
            <a href="${process.env.FRONTEND_URL}/login" class="btn">Go to ClassroomIQ →</a>
          </div>
        </div>
        <div class="footer">ClassroomIQ &nbsp;·&nbsp; This is an automated email, please do not reply.</div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"ClassroomIQ" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Welcome to ClassroomIQ — ${institutionName} is ready!`,
    html,
  });
};

// ─── Send credentials to new teacher or student ───────────────────────────────
const sendCredentialsEmail = async ({ to, fullName, userId, password, role, institutionName }) => {
  if (!to) return; // skip if no email provided

  const transporter = createTransporter();
  const roleLabel = role === 'teacher' ? 'Teacher' : 'Student';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: #6366f1; padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }
        .body { padding: 32px; }
        .body p { color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
        .cred-box { background: #0f172a; border-radius: 10px; padding: 20px 24px; margin: 20px 0; }
        .cred-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 14px; }
        .cred-row:last-child { border-bottom: none; }
        .cred-label { color: #64748b; }
        .cred-value { color: #a5f3fc; font-weight: 700; font-family: monospace; font-size: 15px; letter-spacing: 0.5px; }
        .warning { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #713f12; margin-top: 20px; }
        .btn { display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .footer { padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Your ClassroomIQ Account</h1>
          <p>${institutionName} · ${roleLabel}</p>
        </div>
        <div class="body">
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>Your ClassroomIQ account has been created by your administrator. Here are your login credentials:</p>
          <div class="cred-box">
            <div class="cred-row"><span class="cred-label">User ID</span><span class="cred-value">${userId}</span></div>
            <div class="cred-row"><span class="cred-label">Password</span><span class="cred-value">${password}</span></div>
            <div class="cred-row"><span class="cred-label">Role</span><span class="cred-value">${roleLabel}</span></div>
          </div>
          <div style="text-align:center; margin: 24px 0;">
            <a href="${process.env.FRONTEND_URL}/login" class="btn">Log In Now →</a>
          </div>
          <div class="warning">
            🔒 Please change your password after your first login. Keep these credentials safe and do not share them.
          </div>
        </div>
        <div class="footer">ClassroomIQ &nbsp;·&nbsp; This is an automated email, please do not reply.</div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"ClassroomIQ" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your ClassroomIQ login credentials — ${institutionName}`,
    html,
  });
};

// ─── Verify transporter on startup (optional) ─────────────────────────────────
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Gmail SMTP configured successfully');
  } catch (err) {
    console.warn('⚠️  Gmail SMTP not configured:', err.message);
    console.warn('   Emails will NOT be sent. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env');
  }
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail, sendCredentialsEmail, verifyEmailConfig };
