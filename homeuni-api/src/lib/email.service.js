import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[Email] SMTP not configured — skipping email to ${to}: "${subject}"`);
    return { skipped: true };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, html, text });
  return { sent: true };
}

export function buildStreakReminderEmail(name, streakDays) {
  const firstName = name?.split(' ')[0] || 'there';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:Georgia,serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
    <div style="background:#3d35c4;padding:28px 32px;">
      <div style="color:#fff;font-size:22px;font-weight:600;letter-spacing:0.02em;">Lyceum</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:32px;margin-bottom:12px;">🔥</div>
      <div style="font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:8px;">
        ${firstName}, your ${streakDays}-day streak is at risk
      </div>
      <div style="font-size:15px;color:#555;line-height:1.65;margin-bottom:24px;">
        You haven't studied today yet. Visit any lesson or have a conversation with your professor to keep your streak alive.
      </div>
      <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard"
         style="display:inline-block;background:#3d35c4;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500;">
        Continue learning
      </a>
    </div>
    <div style="padding:16px 32px;background:#f5f4f0;font-size:11px;color:#999;">
      Lyceum · AI-Powered University · You're receiving this because you have an active streak reminder set.
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `Hi ${firstName},\n\nYour ${streakDays}-day streak is at risk — you haven't studied today. Visit ${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard to keep it going.\n\nLyceum`;

  return { subject: `🔥 Keep your ${streakDays}-day streak alive`, html, text };
}
