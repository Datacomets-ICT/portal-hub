// Helpers to export a meeting note as PDF (browser print), .doc (Word
// opens HTML), or plaintext (clipboard). All client-side — no server
// roundtrip, no extra dependencies. The Word export uses the trick that
// modern Word opens an HTML payload labelled application/msword and
// renders it correctly with formatting + tables.

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return `วัน${THAI_DAYS_FULL[x.getDay()]}ที่ ${x.getDate()} ${THAI_MONTHS[x.getMonth()]} ${x.getFullYear() + 543}`;
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

// Normalise a summary blob into a clean array of bullet lines.
// AI sometimes returns the field as a JSON-stringified array
// (e.g. `["• line 1","• line 2"]`) — clean that case too.
export function summaryToList(summary) {
  if (!summary) return [];

  // Already an array? Just clean each item.
  if (Array.isArray(summary)) {
    return summary
      .map(s => String(s).replace(/^[•\-*◦▪■]\s*/, '').trim())
      .filter(Boolean);
  }

  let s = String(summary).trim();

  // Strip a wrapping JSON array if AI returned one as a string
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed
          .map(x => String(x).replace(/^[•\-*◦▪■]\s*/, '').trim())
          .filter(Boolean);
      }
    } catch {
      // Fall through to manual cleanup
    }
  }

  // Crude cleanup for partially-malformed JSON: peel the outer
  // brackets/quotes and split on `","` / newline / `","•`.
  s = s
    .replace(/^\[\s*"?/, '')      // leading [ "
    .replace(/"?\s*\]$/, '')      // trailing " ]
    .replace(/"\s*,\s*"/g, '\n'); // ","  → newline

  return s
    .split(/\r?\n/)
    .map(line => line.replace(/^[•\-*◦▪■]\s*/, '').trim())
    .filter(Boolean);
}

// ===== Build the report HTML (used by both PDF print + DOCX) =====
export function buildReportHtml({ booking, room, employee, note, includeStyles = true }) {
  const dateStr = booking?.bookingDate ? fmtDate(booking.bookingDate) : '';
  const timeStr = booking?.start != null && booking?.end != null
    ? `${fmtTime(booking.start)}–${fmtTime(booking.end)}`
    : '';
  const title    = booking?.title || '(ไม่มีหัวข้อ)';
  const roomName = room?.name || booking?.roomName || '';
  const location = [room?.location, room?.floor].filter(Boolean).join(' · ');
  const booker   = employee?.name || booking?.booker || '';
  const bookerMeta = [employee?.code, employee?.dept].filter(Boolean).join(' · ');
  const purpose  = booking?.purpose || '';
  const attendeesCount = booking?.attendees;

  const summaryItems     = summaryToList(note?.summary);
  const decisions        = Array.isArray(note?.decisions) ? note.decisions : [];
  const topics           = Array.isArray(note?.discussion_topics) ? note.discussion_topics : [];
  const actionItems      = Array.isArray(note?.action_items) ? note.action_items : [];
  const nextMeeting      = note?.next_meeting || '';

  const styles = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Sarabun', 'IBM Plex Sans Thai', system-ui, sans-serif;
      color: #1F2937;
      background: #fff;
      line-height: 1.65;
      font-size: 14px;
      max-width: 820px;
      margin: 0 auto;
      padding: 0;
    }
    .doc-wrap { padding: 36px 40px 60px; }
    .hero {
      background: linear-gradient(135deg, #1E3A8A 0%, #1E40AF 50%, #0F172A 100%);
      color: #FFF;
      padding: 38px 40px 32px;
      position: relative;
      overflow: hidden;
    }
    .hero::after {
      content: '';
      position: absolute;
      right: -60px; top: -60px;
      width: 260px; height: 260px;
      background: radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%);
      pointer-events: none;
    }
    .hero::before {
      content: '';
      position: absolute;
      left: -40px; bottom: -80px;
      width: 200px; height: 200px;
      background: radial-gradient(circle, rgba(96,165,250,0.25), transparent 70%);
      pointer-events: none;
    }
    .hero-kicker {
      font-size: 12px;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      opacity: 0.85;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .hero-title {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.1;
      margin: 0 0 10px;
    }
    .hero-sub {
      font-size: 13px;
      opacity: 0.92;
      font-weight: 500;
    }
    .hero-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin-top: 18px;
      font-size: 12.5px;
      font-weight: 500;
    }
    .hero-meta-row span { display: inline-flex; align-items: center; gap: 6px; opacity: 0.95; }
    .section { margin-top: 26px; }
    .section-title {
      background: linear-gradient(90deg, #0F172A 0%, #1E293B 100%);
      color: #60A5FA;
      padding: 12px 18px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title .num {
      background: #60A5FA;
      color: #0F172A;
      width: 24px; height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800;
    }
    .section-body { padding: 14px 6px 4px; }
    .info-grid {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 8px 18px;
      font-size: 13.5px;
    }
    .info-grid dt { color: #6B7280; font-weight: 600; }
    .info-grid dd { margin: 0; color: #1F2937; }
    ul.bullets, ol.bullets { margin: 4px 0; padding-left: 22px; }
    ul.bullets li, ol.bullets li { margin-bottom: 6px; line-height: 1.65; }
    .topic-block { margin-bottom: 14px; }
    .topic-head {
      font-weight: 700;
      color: #0F172A;
      font-size: 14.5px;
      margin-bottom: 4px;
      border-left: 3px solid #1E40AF;
      padding-left: 10px;
    }
    .decisions-list {
      background: #DBEAFE;
      padding: 12px 14px 12px 32px;
      border-radius: 6px;
      border-left: 4px solid #1E40AF;
    }
    .decisions-list li { color: #1E3A8A; font-weight: 500; }
    table.action {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 4px;
    }
    table.action th {
      background: linear-gradient(90deg, #0F172A 0%, #1E293B 100%);
      color: #60A5FA;
      padding: 10px 12px;
      text-align: left;
      font-weight: 700;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.action td {
      padding: 10px 12px;
      border-bottom: 1px solid #E5E7EB;
      vertical-align: top;
    }
    table.action tr:nth-child(even) td { background: #F8FAFC; }
    table.action tr:last-child td { border-bottom: 0; }
    .col-task   { width: auto; font-weight: 600; }
    .col-owner  { width: 25%; color: #1E40AF; font-weight: 600; }
    .col-due    { width: 22%; color: #6B7280; }
    .next-meeting-box {
      background: #E0E7FF;
      padding: 14px 18px;
      border-radius: 6px;
      border-left: 4px solid #4338CA;
      color: #312E81;
      font-weight: 500;
    }
    .empty { color: #9CA3AF; font-style: italic; font-size: 13px; }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #E5E7EB;
      font-size: 11px;
      color: #9CA3AF;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .hero { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .section-title, table.action th, .decisions-list, .next-meeting-box {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  `;

  const head = includeStyles
    ? `<head>
        <meta charset="utf-8">
        <title>สรุปการประชุม - ${esc(title)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>${styles}</style>
      </head>`
    : '';

  let n = 0;
  const sectionTitle = (label) => `<div class="section-title"><span class="num">${++n}</span>${esc(label)}</div>`;

  const bodyHtml = `
    <div class="hero">
      <div class="hero-kicker">Meeting Summary · สรุปการประชุม</div>
      <h1 class="hero-title">${esc(title)}</h1>
      <div class="hero-sub">${esc(roomName)}${location ? ' — ' + esc(location) : ''}</div>
      <div class="hero-meta-row">
        ${dateStr ? `<span>📅 ${esc(dateStr)}</span>` : ''}
        ${timeStr ? `<span>⏰ ${esc(timeStr)}</span>` : ''}
        ${attendeesCount ? `<span>👥 ${esc(attendeesCount)} คน</span>` : ''}
        ${purpose ? `<span>🎯 ${esc(purpose)}</span>` : ''}
      </div>
    </div>

    <div class="doc-wrap">

      <section class="section">
        ${sectionTitle('ข้อมูลการประชุม')}
        <div class="section-body">
          <dl class="info-grid">
            ${dateStr     ? `<dt>วันที่</dt><dd>${esc(dateStr)}</dd>` : ''}
            ${timeStr     ? `<dt>เวลา</dt><dd>${esc(timeStr)}</dd>` : ''}
            ${roomName    ? `<dt>ห้องประชุม</dt><dd>${esc(roomName)}${location ? ' (' + esc(location) + ')' : ''}</dd>` : ''}
            ${booker      ? `<dt>ผู้จอง</dt><dd>${esc(booker)}${bookerMeta ? ' — ' + esc(bookerMeta) : ''}</dd>` : ''}
            ${attendeesCount ? `<dt>จำนวนผู้เข้าร่วม</dt><dd>${esc(attendeesCount)} คน</dd>` : ''}
            ${purpose     ? `<dt>วัตถุประสงค์</dt><dd>${esc(purpose)}</dd>` : ''}
          </dl>
        </div>
      </section>

      <section class="section">
        ${sectionTitle('ประเด็นการประชุม')}
        <div class="section-body">
          ${topics.length > 0 ? topics.map(t => `
            <div class="topic-block">
              <div class="topic-head">${esc(t.topic || '')}</div>
              ${Array.isArray(t.points) && t.points.length
                ? `<ul class="bullets">${t.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
                : ''}
            </div>
          `).join('') : (
            summaryItems.length > 0
              ? `<ul class="bullets">${summaryItems.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`
              : `<div class="empty">ไม่มีข้อมูล</div>`
          )}
        </div>
      </section>

      ${decisions.length > 0 ? `
      <section class="section">
        ${sectionTitle('ข้อตัดสินใจ')}
        <div class="section-body">
          <ul class="bullets decisions-list">
            ${decisions.map(d => `<li>${esc(d)}</li>`).join('')}
          </ul>
        </div>
      </section>` : ''}

      <section class="section">
        ${sectionTitle('Action Items')}
        <div class="section-body">
          ${actionItems.length > 0 ? `
          <table class="action">
            <thead>
              <tr><th class="col-task">งาน</th><th class="col-owner">ผู้รับผิดชอบ</th><th class="col-due">กำหนดเสร็จ</th></tr>
            </thead>
            <tbody>
              ${actionItems.map(a => `
                <tr>
                  <td class="col-task">${esc(a.task || '')}</td>
                  <td class="col-owner">${esc(a.owner || '—')}</td>
                  <td class="col-due">${esc(a.due || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>` : `<div class="empty">ไม่มี action items</div>`}
        </div>
      </section>

      ${nextMeeting ? `
      <section class="section">
        ${sectionTitle('การประชุมครั้งถัดไป')}
        <div class="section-body">
          <div class="next-meeting-box">${esc(nextMeeting)}</div>
        </div>
      </section>` : ''}

      ${summaryItems.length > 0 && topics.length > 0 ? `
      <section class="section">
        ${sectionTitle('สรุปภาพรวม')}
        <div class="section-body">
          <ul class="bullets">
            ${summaryItems.map(s => `<li>${esc(s)}</li>`).join('')}
          </ul>
        </div>
      </section>` : ''}

      <div class="footer">
        สร้างโดย AI · Meeting Rooms · Datacomets
      </div>
    </div>
  `;

  return includeStyles
    ? `<!DOCTYPE html><html lang="th">${head}<body>${bodyHtml}</body></html>`
    : bodyHtml;
}

// Lazy-load a script from CDN with a hard 15-second timeout.
function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    let done = false;
    const finish = (fn) => () => { if (!done) { done = true; fn(); } };
    const timer = setTimeout(
      finish(() => reject(new Error(`โหลด script ไม่สำเร็จ (timeout 15s): ${src}`))),
      15000
    );
    s.onload = finish(() => {
      clearTimeout(timer);
      if (globalName && !window[globalName]) {
        reject(new Error(`โหลดสำเร็จแต่ window.${globalName} ไม่มี`));
      } else {
        resolve(globalName ? window[globalName] : true);
      }
    });
    s.onerror = finish(() => {
      clearTimeout(timer);
      reject(new Error(`โหลด script ไม่สำเร็จ: ${src}`));
    });
    document.head.appendChild(s);
  });
}

// html2canvas-pro is a fork that supports modern CSS (oklch, lch,
// color-mix, etc.) — the original html2canvas chokes on oklch which
// shows up via the host page's design tokens. jsPDF stays separate
// so we can pass the rendered canvas in directly.
async function loadPdfDeps() {
  await loadScript(
    'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.11/dist/html2canvas-pro.min.js',
    'html2canvas'
  );
  await loadScript(
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'jspdf'
  );
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf?.jsPDF };
}

// Wait for Sarabun (and any other added fonts) to be ready in the
// document we're rendering — html2canvas takes a snapshot, so missed
// fonts mean Thai falls back to a generic system font in the PDF.
async function waitForFonts(doc) {
  if (doc?.fonts?.ready) {
    try { await doc.fonts.ready; } catch {}
  }
}

// ===== Direct download as PDF (no print dialog) =====
// html2canvas-pro renders the offscreen iframe → canvas → jsPDF
// stitches multi-page output. Doing the orchestration ourselves
// instead of relying on html2pdf.js means we can use html2canvas-pro
// (oklch-safe) instead of html2pdf's bundled old html2canvas.
export async function exportAsPdf(args) {
  const { html2canvas, jsPDF } = await loadPdfDeps();
  if (!html2canvas || !jsPDF) {
    throw new Error('PDF library โหลดไม่สำเร็จ');
  }

  const html = buildReportHtml({ ...args, includeStyles: true });

  // Render in an off-screen iframe so the host page's CSS variables
  // (oklch design tokens, etc.) can't leak into the report.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-99999px;top:0;width:820px;height:1200px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  try {
    frame.srcdoc = html;
    await new Promise(res => { frame.onload = res; setTimeout(res, 800); });
    await waitForFonts(frame.contentDocument);

    const body = frame.contentDocument.body;
    // Resize the iframe to fit the actual rendered content height so
    // html2canvas captures everything in one pass.
    frame.style.height = body.scrollHeight + 'px';

    const renderPromise = html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 820,
      windowHeight: body.scrollHeight,
    });
    const canvas = await Promise.race([
      renderPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF render timeout (60s) — ลอง ดาวน์โหลด Word แทน')), 60000)
      ),
    ]);

    // Stitch into a multi-page A4 PDF
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.94);

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const safeTitle = (args.booking?.title || 'meeting').replace(/[^\w฀-๿-]+/g, '_').slice(0, 60);
    pdf.save(`meeting-summary-${safeTitle}.pdf`);
  } finally {
    setTimeout(() => frame.remove(), 100);
  }
}

// ===== Download as Word (Word opens HTML payload as .doc) =====
export function exportAsDoc(args) {
  const inner = buildReportHtml({ ...args, includeStyles: true });
  const wordHtml = `<!DOCTYPE html><html
    xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    </head>
    <body>${inner.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '')}</body>
  </html>`;
  const blob = new Blob(['﻿', wordHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = (args.booking?.title || 'meeting').replace(/[^\w฀-๿-]+/g, '_').slice(0, 60);
  a.href = url;
  a.download = `meeting-summary-${safeTitle}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

// ===== Plain-text version (for clipboard / copy-paste into Line/Slack) =====
export function buildPlainText({ booking, room, employee, note }) {
  const dateStr = booking?.bookingDate ? fmtDate(booking.bookingDate) : '';
  const timeStr = booking?.start != null && booking?.end != null
    ? `${fmtTime(booking.start)}–${fmtTime(booking.end)}` : '';
  const lines = [];

  lines.push('═══════════════════════════════════════');
  lines.push('         📝 สรุปการประชุม');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`หัวข้อ: ${booking?.title || ''}`);
  if (dateStr)  lines.push(`วันที่: ${dateStr}`);
  if (timeStr)  lines.push(`เวลา:   ${timeStr}`);
  if (room?.name) lines.push(`ห้อง:   ${room.name}${room.location ? ` (${room.location} ${room.floor || ''})` : ''}`);
  if (employee?.name || booking?.booker) lines.push(`ผู้จอง: ${employee?.name || booking?.booker}`);
  if (booking?.purpose) lines.push(`วัตถุ:  ${booking.purpose}`);
  if (booking?.attendees) lines.push(`คน:    ${booking.attendees}`);
  lines.push('');

  const topics = Array.isArray(note?.discussion_topics) ? note.discussion_topics : [];
  if (topics.length > 0) {
    lines.push('───── ประเด็นการประชุม ─────');
    topics.forEach(t => {
      lines.push(`▸ ${t.topic || ''}`);
      (t.points || []).forEach(p => lines.push(`  • ${p}`));
      lines.push('');
    });
  } else if (note?.summary) {
    lines.push('───── ประเด็นหลัก ─────');
    lines.push(note.summary);
    lines.push('');
  }

  const decisions = Array.isArray(note?.decisions) ? note.decisions : [];
  if (decisions.length > 0) {
    lines.push('───── ข้อตัดสินใจ ─────');
    decisions.forEach(d => lines.push(`✓ ${d}`));
    lines.push('');
  }

  const actions = Array.isArray(note?.action_items) ? note.action_items : [];
  if (actions.length > 0) {
    lines.push('───── ✅ Action Items ─────');
    actions.forEach((a, i) => {
      const owner = a.owner ? ` [${a.owner}]` : '';
      const due = a.due ? ` (กำหนด: ${a.due})` : '';
      lines.push(`${i + 1}. ${a.task}${owner}${due}`);
    });
    lines.push('');
  }

  if (note?.next_meeting) {
    lines.push('───── การประชุมครั้งถัดไป ─────');
    lines.push(note.next_meeting);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════');
  lines.push('สร้างโดย AI · Meeting Rooms · Datacomets');
  return lines.join('\n');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); return true; }
    catch { return false; }
    finally { ta.remove(); }
  }
}
