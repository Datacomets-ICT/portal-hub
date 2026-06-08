// Vercel serverless: generate an auto-summary for a meeting from
// chat + agenda + attendees + meta (no audio). Uses Gemini Flash via
// the existing key. Triggered on demand from MeetingRoomPanel after
// the meeting end time.
//
// POST /api/meeting-auto-summary  body: { note_id?: ignored, booking_id }
// returns { ok: true, summary: {...} } or { ok: false, error: '...' }

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.0-flash';

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

function buildPrompt(inputs) {
  const b = inputs.booking || {};
  const messages = inputs.messages || [];
  const attendees = inputs.attendees || [];
  const agenda = Array.isArray(b.agenda) ? b.agenda : [];

  const lines = [];
  lines.push('คุณคือผู้ช่วยสรุปการประชุม สรุปจากข้อมูลด้านล่างเป็นภาษาไทย');
  lines.push('');
  lines.push(`หัวข้อ: ${b.title || '-'}`);
  lines.push(`ผู้จัด: ${b.booker || '-'}`);
  lines.push(`วัตถุประสงค์: ${b.purpose || '-'}`);
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
    const { booking_id } = req.body || {};
    if (!booking_id) return res.status(400).json({ ok: false, error: 'booking_id required' });

    const inputs = await sbRpc('mtg_summary_inputs', { p_booking_id: booking_id });
    if (!inputs?.booking) return res.status(404).json({ ok: false, error: 'booking not found' });

    const prompt = buildPrompt(inputs);
    const summary = await callGemini(prompt);

    await sbRpc('mtg_save_auto_summary', { p_booking_id: booking_id, p_summary: summary });

    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
