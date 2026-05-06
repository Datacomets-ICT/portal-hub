// Vercel Serverless Function — forgot password (Gmail SMTP)
//
// User submits employee_id + their contact email. We send a notification
// from data@ictcos-cm.com → data@ictcos-cm.com (the IT inbox), with the
// user's email as Reply-To so IT can hit Reply to respond directly.
//
// Required env vars on Vercel:
//   - GMAIL_USER          (e.g. data@ictcos-cm.com)
//   - GMAIL_APP_PASSWORD  (16-char app password from
//                          https://myaccount.google.com/apppasswords —
//                          requires 2FA on the Google account)
// Optional:
//   - IT_NOTIFY_EMAIL     (defaults to GMAIL_USER, i.e. notifies itself)
//   - APP_URL             (defaults to portal-hub-taupe.vercel.app/it/)

import nodemailer from 'nodemailer';

const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_APP_PWD  = process.env.GMAIL_APP_PASSWORD;
const IT_NOTIFY_TO   = process.env.IT_NOTIFY_EMAIL || GMAIL_USER;
const APP_URL        = process.env.APP_URL || 'https://portal-hub-taupe.vercel.app/it/';

// Per-email rate limit: 1 request per 5 minutes (in-memory, best-effort).
const RATE_LIMIT_MS = 5 * 60 * 1000;
const recentRequests = new Map(); // empId|email → timestamp

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PWD },
  });
  return _transporter;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendNotifyEmail({ userEmail, empId, userAgent, ip }) {
  const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const subject = `🔑 คำขอรีเซ็ตรหัสผ่าน — รหัส ${empId} (${userEmail})`;

  const html = `
<div style="font-family:'IBM Plex Sans Thai','Inter',-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8FAFC;color:#0F172A;">
  <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 6px 0;color:#D97706;">🔑 คำขอรีเซ็ตรหัสผ่าน — IT-Ticket</h2>
    <p style="margin:0 0 18px 0;color:#64748B;font-size:13px;">${escapeHtml(ts)} (Asia/Bangkok)</p>
    <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:8px;padding:16px 18px;margin:14px 0;">
      <div style="font-size:12px;color:#92400E;margin-bottom:4px;">รหัสพนักงาน</div>
      <div style="font-size:20px;font-weight:700;color:#0F172A;letter-spacing:0.5px;">${escapeHtml(empId)}</div>
      <div style="font-size:12px;color:#92400E;margin-top:14px;margin-bottom:4px;">อีเมลที่ใช้ติดต่อกลับ</div>
      <div style="font-size:16px;font-weight:600;color:#0F172A;">
        <a href="mailto:${escapeHtml(userEmail)}?subject=${encodeURIComponent('ตอบกลับคำขอรีเซ็ตรหัสผ่าน — IT-Ticket')}" style="color:#2563EB;text-decoration:underline;">${escapeHtml(userEmail)}</a>
      </div>
    </div>
    <div style="background:#F1F5F9;border-radius:8px;padding:12px 14px;margin-top:14px;font-size:11px;color:#64748B;line-height:1.6;">
      <div><b>IP:</b> ${escapeHtml(ip || '-')}</div>
      <div><b>User-Agent:</b> ${escapeHtml((userAgent || '-').slice(0, 200))}</div>
    </div>
  </div>
</div>`.trim();

  const textFallback = [
    'คำขอรีเซ็ตรหัสผ่าน — IT-Ticket',
    `เวลา: ${ts} (Asia/Bangkok)`,
    `รหัสพนักงาน: ${empId}`,
    `อีเมลผู้ขอ: ${userEmail}`,
    '',
    'กด Reply เพื่อตอบกลับผู้ใช้โดยตรง',
    `หรือเข้าหน้าจัดการ: ${APP_URL}`,
  ].join('\n');

  await getTransporter().sendMail({
    from: `"IT-Ticket System" <${GMAIL_USER}>`,
    to: IT_NOTIFY_TO,
    replyTo: userEmail,
    subject,
    html,
    text: textFallback,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!GMAIL_USER || !GMAIL_APP_PWD) {
    return res.status(500).json({
      success: false,
      message: 'ระบบส่งอีเมลยังไม่พร้อม: ขาด GMAIL_USER / GMAIL_APP_PASSWORD (ติดต่อ IT)',
    });
  }

  try {
    const { email, empId } = req.body || {};
    if (!empId || !String(empId).trim()) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงาน' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanEmpId = String(empId).trim();
    const key = `${cleanEmpId}|${cleanEmail}`;

    // Rate limit per (empId, email) pair
    const last = recentRequests.get(key);
    if (last && Date.now() - last < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - last)) / 1000);
      return res.status(429).json({ success: false, message: `เพิ่งส่งคำขอไป — กรุณารอ ${wait} วินาที` });
    }

    const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';

    await sendNotifyEmail({ userEmail: cleanEmail, empId: cleanEmpId, userAgent: ua, ip });
    recentRequests.set(key, Date.now());

    return res.status(200).json({
      success: true,
      message: 'ส่งคำขอไปทีม IT เรียบร้อย — เจ้าหน้าที่จะติดต่อกลับทางอีเมลที่คุณระบุ',
    });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
}
