// Vercel Serverless Function — forgot password (email-based reset)
//
// Flow:
//   1. Look up employee by email (case-insensitive).
//   2. Generate a new random password.
//   3. Send the credentials to the user's email via Resend.
//   4. ONLY after the email send succeeds, commit the new password to DB.
//      (If email fails, the user's old password stays valid — no lockout.)
//
// Required env vars on Vercel:
//   - SUPABASE_URL                  (e.g. https://dixechuojsfaypagbfqu.supabase.co)
//   - SUPABASE_SERVICE_ROLE_KEY     (Supabase Dashboard → Settings → API → service_role)
//   - RESEND_API_KEY                (https://resend.com → API Keys → re_...)
//   - RESEND_FROM_EMAIL  (optional, defaults to onboarding@resend.dev for testing)
//   - APP_URL            (optional, used in email body — defaults to portal-hub.vercel.app)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dixechuojsfaypagbfqu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const RESEND_FROM  = process.env.RESEND_FROM_EMAIL || 'IT-Ticket System <onboarding@resend.dev>';
const APP_URL      = process.env.APP_URL || 'https://portal-hub-taupe.vercel.app/it/';

// Per-email rate limit: 1 request per 5 minutes (in-memory, best-effort).
// Resets when the serverless function is recycled — good enough to deter
// casual abuse without needing a DB table.
const RATE_LIMIT_MS = 5 * 60 * 1000;
const recentRequests = new Map(); // email → timestamp

function generatePassword() {
  // 10 chars: mix of upper/lower/digits, easy to read (no 0/O/1/l)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function sbFetch(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
}

async function findEmployeeByEmail(email) {
  // case-insensitive match
  const r = await sbFetch(
    `employees?email=ilike.${encodeURIComponent(email)}&select=employee_id,first_name,last_name,nickname,email&limit=1`
  );
  if (!r.ok) throw new Error(`employees lookup failed: ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function updatePassword(employeeId, newPassword) {
  const r = await sbFetch(
    `employees?employee_id=eq.${encodeURIComponent(employeeId)}`,
    { method: 'PATCH', body: JSON.stringify({ password: newPassword }) }
  );
  if (!r.ok) throw new Error(`password update failed: ${r.status} ${await r.text()}`);
}

async function sendResetEmail({ to, fullName, employeeId, newPassword }) {
  const html = `
<div style="font-family:'IBM Plex Sans Thai','Inter',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F8FAFC;color:#0F172A;">
  <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px;">
    <h2 style="margin:0 0 8px 0;color:#2563EB;">🔑 รหัสผ่านใหม่ — IT-Ticket System</h2>
    <p style="margin:0 0 18px 0;color:#475569;font-size:14px;">สวัสดี ${escapeHtml(fullName)} 👋</p>
    <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;">
      ตามที่คุณขอรีเซ็ตรหัสผ่าน นี่คือข้อมูลเข้าสู่ระบบใหม่ของคุณ:
    </p>
    <div style="background:#F1F5F9;border-left:4px solid #2563EB;border-radius:8px;padding:16px 18px;margin:16px 0;">
      <div style="font-size:13px;color:#64748B;">รหัสพนักงาน</div>
      <div style="font-size:18px;font-weight:700;color:#0F172A;letter-spacing:0.5px;">${escapeHtml(employeeId)}</div>
      <div style="font-size:13px;color:#64748B;margin-top:12px;">รหัสผ่านใหม่</div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:700;color:#2563EB;letter-spacing:1px;">${escapeHtml(newPassword)}</div>
    </div>
    <p style="margin:14px 0;font-size:13px;color:#475569;">
      เข้าสู่ระบบที่ <a href="${APP_URL}" style="color:#2563EB;font-weight:600;">${APP_URL}</a><br>
      หลังจาก login กรุณาเปลี่ยนรหัสผ่านในหน้า Profile เพื่อความปลอดภัย
    </p>
    <p style="margin:18px 0 0 0;font-size:12px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:14px;">
      หากคุณไม่ได้เป็นคนขอรีเซ็ตรหัสผ่าน รหัสเดิมยังใช้งานได้ตามปกติจนกว่าคุณจะ login ด้วยรหัสใหม่นี้ — แนะนำให้แจ้งทีม IT ทันที
    </p>
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
      to: [to],
      subject: '🔑 รหัสผ่านใหม่ — IT-Ticket System',
      html,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Resend ${r.status}: ${err.slice(0, 200)}`);
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!SERVICE_KEY) {
    return res.status(500).json({ success: false, message: 'ระบบยังไม่พร้อม: ขาด SUPABASE_SERVICE_ROLE_KEY (ติดต่อ IT)' });
  }
  if (!RESEND_KEY) {
    return res.status(500).json({ success: false, message: 'ระบบส่งอีเมลยังไม่พร้อม: ขาด RESEND_API_KEY (ติดต่อ IT)' });
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
      return res.status(429).json({ success: false, message: `เพิ่งขอรหัสไป — กรุณารอ ${wait} วินาที` });
    }

    const emp = await findEmployeeByEmail(normalized);
    if (!emp) {
      // Don't reveal whether the email exists — but the user explicitly
      // wants helpful errors here, and IT can audit, so we tell them.
      return res.status(404).json({ success: false, message: 'ไม่พบอีเมลนี้ในระบบ — กรุณาตรวจสอบหรือลงทะเบียนใหม่' });
    }

    const newPassword = generatePassword();
    const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim() || emp.nickname || emp.employee_id;

    // Email FIRST — if this fails the user's old password stays intact
    await sendResetEmail({
      to: emp.email,
      fullName,
      employeeId: emp.employee_id,
      newPassword,
    });

    // Email succeeded — commit the password change
    await updatePassword(emp.employee_id, newPassword);
    recentRequests.set(normalized, Date.now());

    return res.status(200).json({
      success: true,
      message: `ส่งรหัสผ่านใหม่ไปที่ ${emp.email} เรียบร้อย — กรุณาตรวจสอบกล่องจดหมาย (รวม Spam)`,
    });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
}
