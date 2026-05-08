// Vercel serverless function — Meeting summary via Gemini Flash audio.
//
// 3-step flow (each step ≤60 s so we fit Vercel Hobby):
//
//   POST /api/meeting-summary?step=upload    body: { note_id, audio_url, mime_type }
//   POST /api/meeting-summary?step=poll      body: { note_id }
//   POST /api/meeting-summary?step=generate  body: { note_id }
//
// step=upload    fetches audio from Supabase Storage, ships it to the
//                Gemini Files API (resumable), saves the returned
//                file_uri to mtg_meeting_notes.gemini_file_uri,
//                returns { state: 'PROCESSING' | 'ACTIVE' }.
//                Long meetings can take 30-90 s on Gemini's side just
//                to ingest; we don't block on that here.
//
// step=poll      checks the Files API state once and writes it back.
//                Frontend calls this every 3 s until state === 'ACTIVE'
//                or 'FAILED'. Returns under 5 s.
//
// step=generate  calls generateContent with the file_uri + the Thai
//                summarisation prompt, parses the JSON, writes
//                transcript / summary / action_items to the row.
//                Long audio (~2 h) generation can hit ~60 s; that's
//                why we don't include the upload step here.
//
// The note row goes through statuses:
//   pending → uploading → processing → ready → generating → done
//   (or ... → error at any point, with error_message recorded)

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

async function getNote(noteId) {
  const r = await fetchSupabase(`/rest/v1/mtg_meeting_notes?id=eq.${encodeURIComponent(noteId)}&select=*`);
  if (!r.ok) throw new Error(`getNote ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Note not found');
  return rows[0];
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

// Retry transient Gemini failures (429/5xx) with exponential backoff.
// Free tier is 15 RPM and the meeting pipeline burns 3+ calls per file,
// so brief bursts hit 429 even though we're nowhere near the daily cap.
// Total wait stays under 30 s so we still finish within the 60 s
// Vercel function ceiling.
async function geminiRetry(fn, { maxAttempts = 3, baseMs = 4000 } = {}) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fn();
      if (res.ok) return res;
      const status = res.status;
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503 && status !== 504) {
        return res;
      }
      const errText = (await res.text()).slice(0, 200);
      lastErr = new Error(`Gemini ${status}: ${errText}`);
      lastErr.status = status;
    } catch (err) {
      lastErr = err;
    }
    if (i < maxAttempts - 1) {
      const wait = baseMs * Math.pow(2, i); // 4s, 8s, 16s
      console.warn(`[gemini-retry] attempt ${i + 1}/${maxAttempts} failed (${lastErr?.status || lastErr?.message}); waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error('All Gemini retries failed');
}

// Resumable upload to Gemini Files API.
async function geminiUploadFile(apiKey, audioBytes, mimeType, displayName) {
  const startRes = await geminiRetry(() => fetch(
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
  ));
  if (!startRes.ok) {
    throw new Error(`Files API start ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned by Files API');

  // Don't retry the binary upload itself — that means resending megabytes.
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

async function geminiGetFile(apiKey, fileName) {
  const r = await geminiRetry(() => fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`));
  if (!r.ok) throw new Error(`Files API get ${r.status}`);
  return await r.json();
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
  const r = await geminiRetry(() => fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  ));
  if (!r.ok) {
    throw new Error(`generateContent ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return text.trim();
}

function parseSummary(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

// ===== step handlers =====

async function stepUpload(apiKey, body) {
  const { note_id, audio_url, mime_type } = body || {};
  if (!note_id || !audio_url) throw new Error('note_id + audio_url required');

  await updateNote(note_id, { status: 'uploading', error_message: null });

  // Pull audio from Supabase Storage
  const audioRes = await fetch(audio_url);
  if (!audioRes.ok) throw new Error(`Failed to fetch audio (${audioRes.status})`);
  const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
  const detectedMime = mime_type || audioRes.headers.get('content-type') || 'audio/webm';

  // Upload to Gemini Files API
  const file = await geminiUploadFile(apiKey, audioBytes, detectedMime, `note-${note_id}`);

  await updateNote(note_id, {
    status: file.state === 'ACTIVE' ? 'ready' : 'processing',
    gemini_file_uri:  file.uri,
    gemini_file_name: file.name,
    gemini_mime_type: file.mimeType || detectedMime,
  });

  return { state: file.state, file_name: file.name, file_uri: file.uri };
}

async function stepPoll(apiKey, body) {
  const { note_id } = body || {};
  if (!note_id) throw new Error('note_id required');

  const note = await getNote(note_id);
  if (!note.gemini_file_name) throw new Error('No Gemini file linked yet — call step=upload first');

  const file = await geminiGetFile(apiKey, note.gemini_file_name);

  if (file.state === 'ACTIVE') {
    await updateNote(note_id, { status: 'ready' });
  } else if (file.state === 'FAILED') {
    await updateNote(note_id, {
      status: 'error',
      error_message: 'Gemini file processing FAILED',
    });
  }

  return { state: file.state };
}

async function stepGenerate(apiKey, body) {
  const { note_id } = body || {};
  if (!note_id) throw new Error('note_id required');

  const note = await getNote(note_id);
  if (!note.gemini_file_uri) throw new Error('No Gemini file URI — call step=upload first');

  await updateNote(note_id, { status: 'generating', error_message: null });

  const text = await geminiGenerate(
    apiKey,
    note.gemini_file_uri,
    note.gemini_mime_type || 'audio/webm'
  );
  const parsed = parseSummary(text);
  if (!parsed) throw new Error('Could not parse Gemini response as JSON');

  await updateNote(note_id, {
    status: 'done',
    transcript: parsed.transcript || '',
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
  });

  return {
    ok: true,
    transcript: parsed.transcript || '',
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
  };
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

  // Step routing — query string OR body field
  const step = (req.query?.step || body?.step || '').toLowerCase();

  try {
    let result;
    if (step === 'upload') {
      result = await stepUpload(apiKey, body);
    } else if (step === 'poll') {
      result = await stepPoll(apiKey, body);
    } else if (step === 'generate') {
      result = await stepGenerate(apiKey, body);
    } else {
      return res.status(400).json({ error: 'step must be upload|poll|generate' });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[meeting-summary]', step, err);
    if (body?.note_id) {
      await updateNote(body.note_id, {
        status: 'error',
        error_message: String(err.message || err).slice(0, 500),
      });
    }
    return res.status(500).json({ error: String(err.message || err) });
  }
}
