// Vercel serverless: generate an auto-summary for a meeting from
// chat + agenda + attendees + meta + attachment text. Uses Gemini Flash
// via the existing key. Triggered on demand from MeetingRoomPanel.
//
// POST /api/meeting-auto-summary
//   body: { booking_id, include_files?: boolean (default true) }
// returns { ok: true, summary: {...} } or { ok: false, error: '...' }

import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.0-flash';

// Per-file safety cap so one giant Excel doesn't blow the prompt. Roughly
// ~12k tokens at ~4 chars/token. Total prompt stays under ~80k tokens even
// with 5 big files attached.
const PER_FILE_CHAR_CAP = 50_000;

const geminiKey = () =>
  process.env.GEMINI_MEETING_API_KEY || process.env.GEMINI_API_KEY || '';

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function sbRpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name}: ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

// ------------------- attachments → text -------------------
async function listAttachments(bookingId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/mtg_attachments?booking_id=eq.${bookingId}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  if (!r.ok) return [];
  try { return await r.json(); } catch { return []; }
}

async function downloadFile(storagePath) {
  // service-role / anon key can read the bucket via REST. Signed URL works
  // too but adds a round-trip; direct object endpoint is faster on server.
  const url = `${SUPABASE_URL}/storage/v1/object/meeting-files/${storagePath}`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`download ${storagePath}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

function detectKind(fileName = '', mime = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (ext === 'pdf' || m.includes('pdf')) return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext) || m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet';
  if (['docx', 'doc'].includes(ext) || m.includes('wordprocessingml')) return 'docx';
  if (['txt', 'md', 'log'].includes(ext) || m.startsWith('text/')) return 'text';
  return 'unknown';
}

async function extractText(file, buf) {
  const kind = detectKind(file.file_name, file.mime_type);
  try {
    if (kind === 'pdf') {
      const { text } = await pdfParse(buf);
      return text.trim();
    }
    if (kind === 'sheet') {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const parts = [];
      for (const name of wb.SheetNames.slice(0, 5)) {
        const ws = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        if (csv.trim()) parts.push(`# ${name}\n${csv}`);
      }
      return parts.join('\n\n').trim();
    }
    if (kind === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return (value || '').trim();
    }
    if (kind === 'text') {
      return buf.toString('utf8').trim();
    }
  } catch (err) {
    return `(extract failed: ${err.message})`;
  }
  return '';
}

async function collectAttachmentTexts(bookingId) {
  const atts = await listAttachments(bookingId);
  if (!atts.length) return [];
  const results = [];
  for (const a of atts) {
    try {
      const buf = await downloadFile(a.storage_path);
      let text = await extractText(a, buf);
      if (!text || text.length < 30) {
        // Likely a scanned PDF or image-only file — skip text path, mark it.
        results.push({ file_name: a.file_name, status: 'no-text', text: '' });
        continue;
      }
      const truncated = text.length > PER_FILE_CHAR_CAP;
      if (truncated) text = text.slice(0, PER_FILE_CHAR_CAP) + '\n... [ตัดท้ายเพราะไฟล์ยาว]';
      results.push({ file_name: a.file_name, status: truncated ? 'truncated' : 'ok', text });
    } catch (err) {
      results.push({ file_name: a.file_name, status: `error: ${err.message}`, text: '' });
    }
  }
  return results;
}

function buildPrompt(inputs, fileTexts = []) {
  const b = inputs.booking || {};
  const messages = inputs.messages || [];
  const attendees = inputs.attendees || [];
  const audio = inputs.audio_note || null;
  const agenda = Array.isArray(b.agenda) ? b.agenda : [];

  const lines = [];
  lines.push('คุณคือผู้ช่วยสรุปการประชุม สรุปจากข้อมูลด้านล่าง — รวมทุกแหล่ง (meta + agenda + ผู้เข้าร่วม + แชท + เนื้อหาไฟล์แนบ + บันทึกเสียงประชุม) — เป็นภาษาไทย ใช้ข้อมูลทุกส่วนที่มี');
  lines.push('');
  lines.push(`หัวข้อ: ${b.title || '-'}`);
  lines.push(`ผู้จัด: ${b.booker || '-'}`);
  lines.push(`วัตถุประสงค์: ${b.purpose || '-'}`);
  if (b.company) lines.push(`บริษัท/ลูกค้า: ${b.company}`);
  if (b.attendees) lines.push(`จำนวนผู้เข้าร่วมที่จองไว้: ${b.attendees} คน`);
  if (b.booking_date) lines.push(`วันที่: ${b.booking_date}`);
  if (b.start_min != null && b.end_min != null) {
    const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    lines.push(`เวลา: ${fmt(b.start_min)}–${fmt(b.end_min)}`);
  }
  lines.push('');

  if (agenda.length) {
    lines.push('วาระการประชุม:');
    for (const a of agenda) lines.push(`  - ${a.text || ''}${a.done ? ' [✓ done]' : ''}`);
    lines.push('');
  }

  if (attendees.length) {
    lines.push('ผู้เข้าร่วม:');
    for (const a of attendees) lines.push(`  - ${a.name || a.employee_id} (${a.status})`);
    lines.push('');
  }

  if (messages.length) {
    lines.push('บทสนทนา (แชท):');
    for (const m of messages) lines.push(`  ${m.name || m.employee_id}: ${m.body}`);
    lines.push('');
  } else {
    lines.push('(ไม่มีบทสนทนาในแชท ใช้ข้อมูลจากวาระ + meta สรุปแทน)');
  }

  const usable = fileTexts.filter((f) => f.text);
  if (usable.length) {
    lines.push('เนื้อหาไฟล์แนบ (extract เป็นข้อความ):');
    for (const f of usable) {
      lines.push(`--- ${f.file_name} ---`);
      lines.push(f.text);
      lines.push('');
    }
  }

  if (audio) {
    lines.push('บันทึกเสียงประชุม (transcribe จาก audio):');
    if (audio.duration_sec) lines.push(`(ความยาว ~${Math.round(audio.duration_sec/60)} นาที)`);
    if (audio.transcript) {
      // cap transcript at 80k chars to keep room for everything else
      const t = audio.transcript.length > 80000 ? audio.transcript.slice(0, 80000) + '\n... [ตัดท้าย]' : audio.transcript;
      lines.push('Transcript:');
      lines.push(t);
      lines.push('');
    }
    if (audio.summary) {
      lines.push('Summary (จากตัวอัดเสียง):');
      lines.push(typeof audio.summary === 'string' ? audio.summary : JSON.stringify(audio.summary));
      lines.push('');
    }
  }

  lines.push('');
  lines.push('ตอบเป็น JSON ตาม schema นี้เท่านั้น ห้ามมีอย่างอื่นนอก JSON:');
  lines.push(`{
  "tldr": "สรุปย่อ 1-2 ประโยค",
  "key_points": ["ประเด็นสำคัญ 1", "ประเด็นสำคัญ 2", ...],
  "decisions": ["ข้อตัดสินใจ 1", ...],
  "action_items": [{"task": "...", "owner": "ชื่อ", "due": "วันที่ถ้ามี"}, ...],
  "next_steps": ["ขั้นถัดไป 1", ...]
}`);
  return lines.join('\n');
}

async function callGemini(prompt) {
  const key = geminiKey();
  if (!key) throw new Error('GEMINI key not set');
  const url = `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`gemini: ${r.status} ${text}`);
  const data = JSON.parse(text);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  // strip ```json fences if any
  const cleaned = out.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return { tldr: cleaned, key_points: [], decisions: [], action_items: [], next_steps: [] }; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }
  try {
    const { booking_id, include_files = true, include_audio = true } = req.body || {};
    if (!booking_id) return res.status(400).json({ ok: false, error: 'booking_id required' });

    const inputs = await sbRpc('mtg_summary_inputs', { p_booking_id: booking_id });
    if (!inputs?.booking) return res.status(404).json({ ok: false, error: 'booking not found' });

    if (!include_audio) inputs.audio_note = null;

    const fileTexts = include_files ? await collectAttachmentTexts(booking_id) : [];
    const prompt = buildPrompt(inputs, fileTexts);
    const summary = await callGemini(prompt);

    // Tag the file-usage stats onto the summary so the UI can show how many
    // files were actually included vs skipped (e.g. scanned PDFs).
    summary._files = fileTexts.map((f) => ({ file_name: f.file_name, status: f.status }));
    summary._used_audio = !!(include_audio && inputs.audio_note && inputs.audio_note.transcript);

    await sbRpc('mtg_save_auto_summary', { p_booking_id: booking_id, p_summary: summary });

    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
