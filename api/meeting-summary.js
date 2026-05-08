// Vercel serverless function — Meeting summary via Gemini Flash audio.
//
// Flow:
//   1. Frontend uploads audio to Supabase Storage (bucket "mtg-audio").
//   2. Frontend inserts a `mtg_meeting_notes` row (status=pending).
//   3. Frontend POSTs { note_id, audio_url, mime_type } here.
//   4. We fetch the audio from Supabase, ship it to the Gemini Files
//      API, wait for it to become ACTIVE, then call generateContent
//      with the file URI and a Thai-language summarisation prompt.
//   5. We update the note row with transcript / summary / action_items.
//
// Why Files API over inline_data: meetings can run 30 min to 2 hours;
// even at low bitrate that's well over the 4.5 MB Vercel POST body
// limit and beyond what Gemini accepts inline. Files API takes up to
// 2 GB and the file URI lives 48 hours.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.0-flash';

const SUMMARY_PROMPT = `คุณเป็น AI ผู้ช่วยสรุปประชุม
1. ฟังเสียงประชุมนี้ทั้งหมด
2. ถอดเสียงเป็นภาษาไทย (transcript) — แยกผู้พูดได้เท่าที่ทำได้ (Speaker A / Speaker B)
3. สรุปประเด็นหลัก 3-7 ข้อ — เน้นข้อที่ตัดสินใจได้แล้ว ไม่ใช่ความเห็น
4. หา action items — ใครต้องทำอะไร (ถ้าระบุชื่อ/แผนกได้ให้ระบุ)

ตอบเป็น JSON เท่านั้น ห้ามใส่ markdown code fence ห้ามใส่ comment:

{
  "transcript": "ถอดเสียงเต็ม...",
  "summary": "• ประเด็นที่ 1\\n• ประเด็นที่ 2\\n• ...",
  "action_items": [
    { "task": "...", "owner": "ชื่อคน/แผนก", "due": "เมื่อไหร่ หรือ ''" }
  ]
}`;

async function fetchSupabase(path, init = {}) {
  const url = process.env.SUPABASE_URL || 'https://dixechuojsfaypagbfqu.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY');
  const r = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
  return r;
}

async function updateNote(noteId, patch) {
  try {
    await fetchSupabase(`/rest/v1/mtg_meeting_notes?id=eq.${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn('[meeting-summary] failed to update note', noteId, e.message);
  }
}

// Upload bytes to Gemini Files API using the simple "media" upload.
// Returns the file resource — { name, uri, mimeType, state }.
async function geminiUploadFile(apiKey, audioBytes, mimeType, displayName) {
  const startRes = await fetch(
    `${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(audioBytes.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName || 'meeting-audio' } }),
    }
  );
  if (!startRes.ok) {
    throw new Error(`Files API start ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned by Files API');

  const finalRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(audioBytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: audioBytes,
  });
  if (!finalRes.ok) {
    throw new Error(`Files API upload ${finalRes.status}: ${(await finalRes.text()).slice(0, 300)}`);
  }
  const data = await finalRes.json();
  return data.file;
}

// Poll Files API until the file's state leaves PROCESSING.
async function waitForFileActive(apiKey, fileName, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (r.ok) {
      const f = await r.json();
      if (f.state === 'ACTIVE') return f;
      if (f.state === 'FAILED') throw new Error('Gemini file processing FAILED');
    }
    await new Promise(res => setTimeout(res, 1500));
  }
  throw new Error('Timed out waiting for Gemini to process audio');
}

async function geminiGenerate(apiKey, fileUri, mimeType) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType, fileUri } },
        { text: SUMMARY_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };
  const r = await fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) {
    throw new Error(`generateContent ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return text.trim();
}

function parseSummary(text) {
  if (!text) return null;
  // Strip code fences just in case
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return null;
  }
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  let body;
  try { body = req.body; if (typeof body === 'string') body = JSON.parse(body); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { note_id, audio_url, mime_type } = body || {};
  if (!note_id || !audio_url) {
    return res.status(400).json({ error: 'note_id and audio_url required' });
  }

  // Mark as processing so the UI can show a spinner if it polls
  await updateNote(note_id, { status: 'processing', error_message: null });

  try {
    // 1) Pull audio from storage
    const audioRes = await fetch(audio_url);
    if (!audioRes.ok) throw new Error(`Failed to fetch audio (${audioRes.status})`);
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    const detectedMime = mime_type || audioRes.headers.get('content-type') || 'audio/webm';

    // 2) Upload to Gemini Files API
    const file = await geminiUploadFile(apiKey, audioBytes, detectedMime, `note-${note_id}`);

    // 3) Wait for processing
    const ready = await waitForFileActive(apiKey, file.name);

    // 4) Summarise
    const text = await geminiGenerate(apiKey, ready.uri, ready.mimeType || detectedMime);
    const parsed = parseSummary(text);
    if (!parsed) throw new Error('Could not parse Gemini response as JSON');

    // 5) Save to DB
    await updateNote(note_id, {
      status: 'done',
      transcript: parsed.transcript || '',
      summary: parsed.summary || '',
      action_items: parsed.action_items || [],
    });

    return res.status(200).json({
      ok: true,
      transcript: parsed.transcript || '',
      summary: parsed.summary || '',
      action_items: parsed.action_items || [],
    });
  } catch (err) {
    console.error('[meeting-summary] error:', err);
    await updateNote(note_id, {
      status: 'error',
      error_message: String(err.message || err).slice(0, 500),
    });
    return res.status(500).json({ error: String(err.message || err) });
  }
}
