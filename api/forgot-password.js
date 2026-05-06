// Vercel Serverless Function — forgot password (notify IT only)
//
// Flow: user enters their email → we send a notification email to the
// IT inbox (data@ictcos-cm.com). IT then contacts the user manually and
// resets the password by hand. No DB changes, no service-role access.
//
// Required env vars:
//   - RESEND_API_KEY     (https://resend.com → API Keys → re_...)
// Optional:
//   - RESEND_FROM_EMAIL  (defaults to onboarding@resend.dev for testing)
//   - IT_NOTIFY_EMAIL    (defaults to data@ictcos-cm.com)
//   - APP_URL            (used in email body; defaults to portal-hub-taupe.vercel.app/it/)

const RESEND_KEY     = process.env.RESEND_API_KEY;
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL || 'IT-Ticket System <onboarding@resend.dev>';
const IT_NOTIFY_TO   = process.env.IT_NOTIFY_EMAIL || 'data@ictcos-cm.com';
const APP_URL        = process.env.APP_URL || 'https://portal-hub-taupe.vercel.app/it/';

// Per-email rate limit: 1 request per 5 minutes (in-memory, best-effort).
const RATE_LIMIT_MS = 5 * 60 * 1000;
const recentRequests = new Map(); // email → timestamp

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendNotifyEmail({ userEmail, userAgent, ip }) {
  const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const html = `
<div style="font-family:'IBM Plex Sans Thai','Inter',sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8FAFC;color:#0F172A;">
  <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 6px 0;color:#D97706;">🔑 คำขอรีเซ็ตรหัสผ่าน — IT-Ticket</h2>
    <p style="margin:0 0 18px 0;color:#64748B;font-size:13px;">${escapeHtml(ts)} (Asia/Bangkok)</p>
    <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:8px;padding:16px 18px;margin:14px 0;">
      <div style="font-size:12px;color:#92400E;margin-bottom:4px;">อีเมลผู้ขอ</div>
      <div style="font-size:18px;font-weight:700;color:#0F172A;">${escapeHtml(userEmail)}</div>
    </div>
    <p style="margin:14px 0;font-size:14px;line-height:1.6;color:#334155;">
      โปรดติดต่อผู้ใช้กลับเพื่อยืนยันตัวตน แล้วตั้งรหัสผ่านใหม่ให้ทาง
      <a href="${APP_URL}" style="color:#2563EB;font-weight:600;">หน้าจัดการของ IT</a>
    </p>
    <div style="background:#F1F5F9;border-radius:8px;padding:12px 14px;margin-top:14px;font-size:11px;color:#64748B;line-height:1.6;">
      <div><b>IP:</b> ${escapeHtml(ip || '-')}</div>
      <div><b>User-Agent:</b> ${escapeHtml((userAgent || '-').slice(0, 200))}</div>
    </div>
  </div>
</div>`.trim();

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [IT_NOTIFY_TO],
      reply_to: userEmail,
      subject: `🔑 คำขอรีเซ็ตรหัสผ่านจาก ${userEmail}`,
      html,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Resend ${r.status}: ${err.slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!RESEND_KEY) {
    return res.status(500).json({ success: false, message: 'ระบบยังไม่พร้อม: ขาด RESEND_API_KEY (ติดต่อ IT)' });
  }

  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }

    const normalized = email.trim().toLowerCase();

    // Rate limit
    const last = recentRequests.get(normalized);
    if (last && Date.now() - last < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - last)) / 1000);
      return res.status(429).json({ success: false, message: `เพิ่งส่งคำขอไป — กรุณารอ ${wait} วินาที` });
    }

    const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';

    await sendNotifyEmail({ userEmail: normalized, userAgent: ua, ip });
    recentRequests.set(normalized, Date.now());

    return res.status(200).json({
      success: true,
      message: 'ส่งคำขอไปยังทีม IT เรียบร้อย — เจ้าหน้าที่จะติดต่อกลับเพื่อตั้งรหัสผ่านใหม่ให้',
    });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
}
