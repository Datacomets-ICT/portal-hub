// Vercel serverless function — send a meeting summary as a formal
// HTML email via Gmail SMTP (nodemailer).
//
// Body shape:
//   {
//     note_id: "...",
//     to:      ["recipient@example.com", ...],   // required, ≥1
//     cc:      ["cc@example.com", ...],          // optional
//     subject: "...",                            // optional, auto-built
//     message: "..."                             // optional intro paragraph
//   }
//
// Required env vars:
//   GMAIL_USER          — the gmail address that does the sending
//   GMAIL_APP_PASSWORD  — 16-char app password (NOT the gmail password)
//                         created at https://myaccount.google.com/apppasswords
//                         (requires 2-step verification enabled first)
//   EMAIL_FROM (opt)    — display name + address shown to recipients,
//                         defaults to "Teamdata <${GMAIL_USER}>"

import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dixechuojsfaypagbfqu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function sb(path, init = {}) {
  if (!SUPABASE_KEY) throw new Error('Supabase key missing');
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...(init.headers || {}),
    },
  });
  return r;
}

async function getNote(noteId) {
  const r = await sb(`/rest/v1/mtg_meeting_notes?id=eq.${encodeURIComponent(noteId)}&select=*`);
  if (!r.ok) throw new Error(`getNote ${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error('Note not found');
  return rows[0];
}

async function getBooking(bookingId) {
  if (!bookingId) return null;
  const r = await sb(`/rest/v1/mtg_bookings?id=eq.${encodeURIComponent(bookingId)}&select=*`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function getRoom(roomId) {
  if (!roomId) return null;
  const r = await sb(`/rest/v1/mtg_rooms?id=eq.${encodeURIComponent(roomId)}&select=*`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

const THAI_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return `วัน${THAI_DAYS[x.getDay()]}ที่ ${x.getDate()} ${THAI_MONTHS[x.getMonth()]} ${x.getFullYear() + 543}`;
}
function fmtTime(min) {
  if (typeof min !== 'number') return '';
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function summaryToList(summary) {
  if (!summary) return [];
  if (Array.isArray(summary)) {
    return summary.map(s => String(s).replace(/^[•\-*◦▪■]\s*/, '').trim()).filter(Boolean);
  }
  let s = String(summary).trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map(x => String(x).replace(/^[•\-*◦▪■]\s*/, '').trim()).filter(Boolean);
      }
    } catch {}
  }
  return s.split(/\r?\n/).map(line => line.replace(/^[•\-*◦▪■]\s*/, '').trim()).filter(Boolean);
}

// ===== Email HTML builder =====
// Built with table-based layout + inline styles so it renders the
// same in Gmail / Outlook / Apple Mail / mobile clients. No external
// stylesheets, no <link>, no flexbox/grid.
function buildEmailHtml({ booking, room, note, message }) {
  const dateStr = booking?.booking_date ? fmtDate(booking.booking_date) : '';
  const timeStr = booking?.start_min != null && booking?.end_min != null
    ? `${fmtTime(booking.start_min)}–${fmtTime(booking.end_min)}` : '';
  const title = booking?.title || '(ไม่มีหัวข้อ)';
  const roomName = room?.name || '';
  const location = [room?.location, room?.floor].filter(Boolean).join(' · ');
  const booker = booking?.booker || '';
  const purpose = booking?.purpose || '';

  const summaryItems = summaryToList(note?.summary);
  const decisions = Array.isArray(note?.decisions) ? note.decisions : [];
  const topics = Array.isArray(note?.discussion_topics) ? note.discussion_topics : [];
  const actions = Array.isArray(note?.action_items) ? note.action_items : [];
  const nextMeeting = note?.next_meeting || '';

  const sectionTitle = (label) => `
    <tr><td style="padding:18px 0 8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td style="background:linear-gradient(90deg,#0F172A 0%,#1E293B 100%);padding:11px 16px;border-radius:6px;">
          <div style="color:#60A5FA;font-weight:800;font-size:14px;letter-spacing:0.4px;">${esc(label)}</div>
        </td></tr>
      </table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc('สรุปการประชุม - ' + title)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Sarabun',sans-serif;color:#1F2937;line-height:1.6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F1F5F9;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#FFFFFF;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">

      <!-- Hero banner -->
      <tr><td style="background:linear-gradient(135deg,#1E3A8A 0%,#1E40AF 50%,#0F172A 100%);padding:32px 28px;color:#FFFFFF;">
        <div style="font-size:11px;letter-spacing:2.2px;text-transform:uppercase;opacity:0.85;font-weight:600;margin-bottom:6px;">Meeting Summary · สรุปการประชุม</div>
        <div style="font-size:26px;font-weight:800;line-height:1.2;margin-bottom:8px;">${esc(title)}</div>
        <div style="font-size:13px;opacity:0.92;">${esc(roomName)}${location ? ' — ' + esc(location) : ''}</div>
        <div style="margin-top:14px;font-size:12.5px;opacity:0.95;">
          ${dateStr ? `📅 ${esc(dateStr)}` : ''}
          ${timeStr ? `&nbsp;&nbsp;⏰ ${esc(timeStr)}` : ''}
          ${booking?.attendees ? `&nbsp;&nbsp;👥 ${esc(booking.attendees)} คน` : ''}
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:8px 28px 32px;">

        ${message ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="padding:18px 0 4px;color:#1F2937;font-size:14px;line-height:1.7;">
            ${esc(message).replace(/\n/g, '<br>')}
          </td></tr>
        </table>` : ''}

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

          ${sectionTitle('ข้อมูลการประชุม')}
          <tr><td style="padding:8px 0 4px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="6" border="0" style="font-size:13.5px;color:#1F2937;">
              ${dateStr     ? `<tr><td width="120" style="color:#6B7280;font-weight:600;padding:4px 0;">วันที่</td><td style="padding:4px 0;">${esc(dateStr)}</td></tr>` : ''}
              ${timeStr     ? `<tr><td style="color:#6B7280;font-weight:600;padding:4px 0;">เวลา</td><td style="padding:4px 0;">${esc(timeStr)}</td></tr>` : ''}
              ${roomName    ? `<tr><td style="color:#6B7280;font-weight:600;padding:4px 0;">ห้องประชุม</td><td style="padding:4px 0;">${esc(roomName)}${location ? ' (' + esc(location) + ')' : ''}</td></tr>` : ''}
              ${booker      ? `<tr><td style="color:#6B7280;font-weight:600;padding:4px 0;">ผู้จอง</td><td style="padding:4px 0;">${esc(booker)}</td></tr>` : ''}
              ${booking?.attendees ? `<tr><td style="color:#6B7280;font-weight:600;padding:4px 0;">ผู้เข้าร่วม</td><td style="padding:4px 0;">${esc(booking.attendees)} คน</td></tr>` : ''}
              ${purpose     ? `<tr><td style="color:#6B7280;font-weight:600;padding:4px 0;">วัตถุประสงค์</td><td style="padding:4px 0;">${esc(purpose)}</td></tr>` : ''}
            </table>
          </td></tr>

          ${sectionTitle('ประเด็นการประชุม')}
          <tr><td style="padding:8px 0 4px;">
            ${topics.length > 0 ? topics.map(t => `
              <div style="margin-bottom:14px;">
                <div style="font-weight:700;color:#0F172A;font-size:14px;border-left:3px solid #1E40AF;padding:2px 0 2px 10px;margin-bottom:6px;">${esc(t.topic || '')}</div>
                ${Array.isArray(t.points) && t.points.length ? `<ul style="margin:0 0 0 22px;padding:0;color:#1F2937;font-size:13px;line-height:1.7;">
                  ${t.points.map(p => `<li style="margin-bottom:4px;">${esc(p)}</li>`).join('')}
                </ul>` : ''}
              </div>
            `).join('') : (
              summaryItems.length > 0
                ? `<ul style="margin:0 0 0 22px;padding:0;color:#1F2937;font-size:13.5px;line-height:1.75;">
                    ${summaryItems.map(s => `<li style="margin-bottom:5px;">${esc(s)}</li>`).join('')}
                  </ul>`
                : `<div style="color:#9CA3AF;font-style:italic;font-size:13px;">ไม่มีข้อมูล</div>`
            )}
          </td></tr>

          ${decisions.length > 0 ? `
            ${sectionTitle('ข้อตัดสินใจ')}
            <tr><td style="padding:8px 0 4px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="background:#DBEAFE;padding:14px 16px 14px 32px;border-radius:6px;border-left:4px solid #1E40AF;">
                  <ul style="margin:0;padding:0;color:#1E3A8A;font-size:13.5px;line-height:1.75;">
                    ${decisions.map(d => `<li style="margin-bottom:5px;font-weight:500;">${esc(d)}</li>`).join('')}
                  </ul>
                </td></tr>
              </table>
            </td></tr>
          ` : ''}

          ${actions.length > 0 ? `
            ${sectionTitle('Action Items')}
            <tr><td style="padding:8px 0 4px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:13px;">
                <tr>
                  <th align="left" style="background:linear-gradient(90deg,#0F172A 0%,#1E293B 100%);color:#60A5FA;padding:10px 12px;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;">งาน</th>
                  <th align="left" style="background:linear-gradient(90deg,#0F172A 0%,#1E293B 100%);color:#60A5FA;padding:10px 12px;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;width:25%;">ผู้รับผิดชอบ</th>
                  <th align="left" style="background:linear-gradient(90deg,#0F172A 0%,#1E293B 100%);color:#60A5FA;padding:10px 12px;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;width:22%;">กำหนดเสร็จ</th>
                </tr>
                ${actions.map((a, i) => `
                  <tr style="background:${i % 2 ? '#F8FAFC' : '#FFFFFF'};">
                    <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-weight:600;color:#1F2937;">${esc(a.task || '')}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#1E40AF;font-weight:600;">${esc(a.owner || '—')}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#6B7280;">${esc(a.due || '—')}</td>
                  </tr>
                `).join('')}
              </table>
            </td></tr>
          ` : ''}

          ${nextMeeting ? `
            ${sectionTitle('การประชุมครั้งถัดไป')}
            <tr><td style="padding:8px 0 4px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="background:#E0E7FF;padding:14px 18px;border-radius:6px;border-left:4px solid #4338CA;color:#312E81;font-weight:500;font-size:13.5px;">
                  ${esc(nextMeeting)}
                </td></tr>
              </table>
            </td></tr>
          ` : ''}

        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:18px 28px 24px;border-top:1px solid #E5E7EB;background:#F8FAFC;text-align:center;">
        <div style="font-size:11px;color:#9CA3AF;line-height:1.6;">
          เอกสารนี้สร้างโดย AI · Datacomets Meetings<br>
          <span style="font-size:10.5px;opacity:0.8;">หากมีข้อสงสัยเกี่ยวกับการประชุม โปรดติดต่อผู้จองโดยตรง</span>
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ===== Gmail SMTP send helper (nodemailer) =====
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD env vars not set');
  }
  // Gmail's documented SMTP relay — service:'gmail' auto-fills host/port.
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

async function sendViaGmail({ from, to, cc, subject, html, replyTo }) {
  const transporter = getTransporter();
  const result = await transporter.sendMail({
    from,
    to: Array.isArray(to) ? to.join(', ') : to,
    cc: cc && cc.length ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
    subject,
    html,
    replyTo: replyTo || undefined,
  });
  return result;  // { messageId, accepted, rejected, ... }
}

function normaliseEmails(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(/[,;\n]+/);
  return arr
    .map(e => String(e).trim())
    .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = req.body; if (typeof body === 'string') body = JSON.parse(body); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { note_id, subject: customSubject, message } = body || {};
  const to = normaliseEmails(body?.to);
  const cc = normaliseEmails(body?.cc);

  if (!note_id) return res.status(400).json({ error: 'note_id required' });
  if (to.length === 0) return res.status(400).json({ error: 'อย่างน้อยต้องมี email "ถึง" 1 อัน' });

  try {
    const note = await getNote(note_id);
    if (note.status !== 'done') {
      return res.status(400).json({ error: 'Summary ยังไม่เสร็จ — รอให้ AI สรุปให้เสร็จก่อนส่ง email' });
    }

    const booking = await getBooking(note.booking_id);
    const room = booking ? await getRoom(booking.room_id) : null;

    const html = buildEmailHtml({ booking, room, note, message });

    // Subject: [สรุปการประชุม] {หัวข้อ} - {วันที่}
    const dateStr = booking?.booking_date ? fmtDate(booking.booking_date) : '';
    const subject = customSubject
      || `[สรุปการประชุม] ${booking?.title || 'ประชุม'}${dateStr ? ' - ' + dateStr : ''}`;

    const gmailUser = process.env.GMAIL_USER || '';
    const from = process.env.EMAIL_FROM
      || (gmailUser ? `Teamdata <${gmailUser}>` : 'Teamdata');

    const result = await sendViaGmail({ from, to, cc, subject, html });
    return res.status(200).json({
      ok: true,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      sent_to: to.length,
      sent_cc: cc.length,
    });
  } catch (err) {
    console.error('[meeting-email]', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
