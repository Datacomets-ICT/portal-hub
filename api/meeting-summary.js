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

// === Per-feature API keys ===
// Meeting-specific keys isolate quota from IT-Ticket. If the meeting
// key isn't set, fall back to the shared one so legacy deploys keep
// working without any env-var changes.
const groqKey = () =>
  process.env.GROQ_MEETING_API_KEY || process.env.GROQ_API_KEY || '';
const geminiKey = () =>
  process.env.GEMINI_MEETING_API_KEY || process.env.GEMINI_API_KEY || '';
const deepgramKey = () => process.env.DEEPGRAM_API_KEY || '';

const SUMMARY_PROMPT = `คุณเป็น AI ผู้ช่วยสรุปประชุม วิเคราะห์เสียงประชุมนี้ออกเป็น meeting minutes แบบครบถ้วน + แท็กผู้พูด
ตอบเป็น JSON เท่านั้น ห้ามใส่ markdown ห้ามใส่ comment

{
  "transcript": "ถอดเสียงเต็ม ภาษาไทย พร้อมแท็ก [ผู้พูด A], [ผู้พูด B], [ผู้พูด C], ... หน้าประโยคของแต่ละคน",
  "summary": "ประเด็นหลัก 3-7 ข้อ บรรทัดละข้อ ขึ้นต้นด้วย •",
  "discussion_topics": [
    { "topic": "หัวข้อย่อย", "points": ["รายละเอียด 1", "...2"] }
  ],
  "decisions": ["ข้อตัดสินใจที่ทุกคนตกลงแล้ว 1", "...2"],
  "action_items": [
    { "task": "งานที่ต้องทำ", "owner": "ชื่อคน/แผนก หรือ ''", "due": "เมื่อไหร่ หรือ ''" }
  ],
  "next_meeting": "ถ้ามีนัดประชุมต่อ ระบุวัน/เวลา/หัวข้อ — ไม่มีก็ ''"
}

กฎ:
- ทุก field ภาษาไทย
- transcript ต้องแท็กผู้พูด: [ผู้พูด A] / [ผู้พูด B] / ... — เปลี่ยนเมื่อเปลี่ยนเสียง/หัวข้อ/ถาม-ตอบ
  ตัวอย่าง:
    [ผู้พูด A] สวัสดีครับ เริ่มประชุมเลย
    [ผู้พูด B] ครับผม ขอเสนอเรื่อง...
- decisions ต่างจาก summary — ต้องเป็นข้อสรุปที่ตกลงแล้ว
- ห้ามแต่งข้อมูล ถ้าไม่มีใน audio ให้เว้น`;

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
  let obj = null;
  try { obj = JSON.parse(cleaned); } catch {}
  if (!obj) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { obj = JSON.parse(m[0]); } catch {}
    }
  }
  if (!obj) return null;

  // Normalise summary to a plain "• line\n• line" string.
  // AI sometimes returns an array, or a stringified JSON array — both
  // render as garbage in the UI ([" line ", "line "]). Flatten here.
  if (Array.isArray(obj.summary)) {
    obj.summary = obj.summary
      .map(s => {
        const t = String(s).trim();
        return t.startsWith('•') ? t : `• ${t}`;
      })
      .join('\n');
  } else if (typeof obj.summary === 'string') {
    const s = obj.summary.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          obj.summary = parsed
            .map(x => {
              const t = String(x).trim();
              return t.startsWith('•') ? t : `• ${t}`;
            })
            .join('\n');
        }
      } catch {}
    }
  }

  return obj;
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

// ---- Groq Whisper fallback (used when Gemini hits quota) ----
// Whisper transcribes audio (free tier ~28k min/day on Groq), then we
// hand the transcript to a Groq LLM for the summary. End-to-end this
// often beats the Gemini Files-API roundtrip on speed too.
const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3';
const GROQ_LLM_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

async function groqWhisperTranscribe(groqKey, audioBytes, mimeType, fileName) {
  const fd = new FormData();
  // Node 18+ fetch supports Blob in FormData
  const blob = new Blob([audioBytes], { type: mimeType || 'audio/webm' });
  fd.append('file', blob, fileName || 'meeting.webm');
  fd.append('model', GROQ_WHISPER_MODEL);
  fd.append('language', 'th');
  fd.append('response_format', 'text');

  const r = await fetch(GROQ_AUDIO_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${groqKey}` },
    body: fd,
  });
  if (!r.ok) {
    throw new Error(`Whisper ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  // response_format=text returns plain text body
  return (await r.text()).trim();
}

async function groqSummarizeTranscript(groqKey, transcript) {
  const prompt = `วิเคราะห์ transcript การประชุมนี้ออกเป็น meeting minutes แบบครบถ้วน + เดาผู้พูดจากบริบท
ตอบเป็น JSON เท่านั้น ห้ามใส่ markdown ห้ามใส่ comment

{
  "speaker_transcript": "string — transcript ดั้งเดิมที่เพิ่มแท็ก [ผู้พูด A], [ผู้พูด B], [ผู้พูด C] ... หน้าประโยคของแต่ละคน เก็บคำเดิมตาม transcript ห้ามตัดห้ามสรุป ห้ามแก้สำนวน",
  "summary": "string เดียว — ประเด็นหลัก 3-7 ข้อ คั่นด้วย \\n บรรทัดละข้อ ขึ้นต้นด้วย • ห้ามเป็น array",
  "discussion_topics": [
    { "topic": "หัวข้อย่อย", "points": ["รายละเอียด 1", "...2"] }
  ],
  "decisions": ["ข้อตัดสินใจที่ทุกคนเห็นด้วยแล้ว 1", "...2"],
  "action_items": [
    { "task": "งานที่ต้องทำ", "owner": "ชื่อคน/แผนก หรือ ''", "due": "วันกำหนดเสร็จ หรือ ''" }
  ],
  "next_meeting": "ถ้ามีการนัดประชุมครั้งหน้า ระบุวัน/เวลา/หัวข้อ — ถ้าไม่มีให้เว้นว่าง ''"
}

กฎสำคัญ:
- ทุก field ใช้ภาษาไทย (ยกเว้นชื่อโปรแกรม/ตัวย่อภาษาอังกฤษคงเดิม)
- "speaker_transcript" คือ transcript ดั้งเดิมที่ "เดา" และเพิ่มแท็กผู้พูด:
  - ใช้ [ผู้พูด A], [ผู้พูด B], [ผู้พูด C], ... ตามจำนวนคนที่เดาได้
  - เปลี่ยนผู้พูดเมื่อ: เปลี่ยนหัวข้อ, มีการถาม-ตอบ, เปลี่ยนสรรพนาม, สไตล์การพูดต่างกัน
  - ผู้พูดคนเดียวกัน = แท็กเดียวกันตลอด
  - ถ้าเดาไม่แน่ ใช้ [ผู้พูด ?]
  - ✅ เก็บคำพูดเดิมทั้งหมด ห้ามตัดห้ามแต่ง
  - ตัวอย่างรูปแบบ:
    [ผู้พูด A] สวัสดีครับ วันนี้เรามาคุยเรื่องเซเว่น
    [ผู้พูด B] ครับ ผมว่าเราควรลดราคา
    [ผู้พูด A] เห็นด้วย แล้วเรื่องงบล่ะ
    [ผู้พูด C] ขอเสริมหน่อย
- "summary" ต้องเป็น string เดียว — ห้ามเป็น array
  ถูก: "summary": "• ข้อ 1\\n• ข้อ 2"
  ผิด: "summary": ["• ข้อ 1","• ข้อ 2"]
- "discussion_topics" คือบทสนทนาแยกตามหัวข้อ — แต่ละหัวข้อมี 2-5 bullet points
- "decisions" ต่างจาก "summary" คือ เป็นข้อสรุปที่ทุกคน "ตกลง" แล้ว
- "action_items" — ถ้าไม่ระบุชื่อคน ใส่แผนกหรือ ''
- ห้ามแต่งข้อมูลที่ไม่อยู่ใน transcript

Transcript:
${transcript.slice(0, 50000)}`;

  const r = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: GROQ_LLM_MODEL,
      messages: [
        { role: 'system', content: 'You are an assistant that summarises Thai meeting transcripts. Output ONLY valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) {
    throw new Error(`Groq summary ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = await r.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

// === PRIMARY PATH: Groq Whisper + Groq LLM, single call ===
// Faster + better Thai transcription than Gemini Files API. Free
// quota (28k min/day on Whisper, 14k req/day on Groq LLM) is also
// far larger than Gemini's 1500/day shared pool. Used as ?step=process.
async function stepProcess(body) {
  const { note_id } = body || {};
  if (!note_id) throw new Error('note_id required');

  const key = groqKey();
  if (!key) throw new Error('GROQ_MEETING_API_KEY / GROQ_API_KEY not set');

  const note = await getNote(note_id);
  if (!note.audio_url) throw new Error('Note has no audio_url');

  await updateNote(note_id, { status: 'generating', error_message: null });

  const audioRes = await fetch(note.audio_url);
  if (!audioRes.ok) throw new Error(`Failed to fetch audio (${audioRes.status})`);
  const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
  const mime = audioRes.headers.get('content-type') || 'audio/webm';

  const rawTranscript = await groqWhisperTranscribe(key, audioBytes, mime, `note-${note_id}.webm`);
  const summaryText = await groqSummarizeTranscript(key, rawTranscript);
  const parsed = parseSummary(summaryText);
  if (!parsed) throw new Error('Could not parse Groq summary as JSON');

  // Use the speaker-tagged version when the LLM produced one;
  // otherwise fall back to Whisper's raw output.
  const transcript = parsed.speaker_transcript || rawTranscript;

  await updateNote(note_id, {
    status: 'done',
    transcript,
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
  });

  return {
    ok: true,
    provider: 'groq-whisper',
    transcript,
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
  };
}

// === LAYER 3 FALLBACK: Deepgram Nova-2 ===
// Used when both Groq Whisper and Gemini Files API are exhausted.
// Deepgram has a $200 free credit on signup (~775 hours of audio)
// which gives Comets ~10 months of headroom before any payment is
// involved. Transcription only — summary still goes through Groq LLM.
const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen?model=nova-2&language=th&smart_format=true&punctuate=true';

async function deepgramTranscribe(dgKey, audioBytes, mimeType) {
  const r = await fetch(DEEPGRAM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${dgKey}`,
      'Content-Type': mimeType || 'audio/mpeg',
    },
    body: audioBytes,
  });
  if (!r.ok) {
    throw new Error(`Deepgram ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = await r.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  if (!transcript.trim()) {
    throw new Error('Deepgram returned empty transcript');
  }
  return transcript;
}

async function stepDeepgram(body) {
  const { note_id } = body || {};
  if (!note_id) throw new Error('note_id required');

  const dgKey = deepgramKey();
  if (!dgKey) throw new Error('DEEPGRAM_API_KEY not set');

  // We still use Groq LLM to summarise the transcript Deepgram gives us.
  const gKey = groqKey();
  if (!gKey) throw new Error('No Groq key available for summarisation');

  const note = await getNote(note_id);
  if (!note.audio_url) throw new Error('Note has no audio_url');

  await updateNote(note_id, { status: 'generating', error_message: null });

  const audioRes = await fetch(note.audio_url);
  if (!audioRes.ok) throw new Error(`Failed to fetch audio (${audioRes.status})`);
  const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
  const mime = audioRes.headers.get('content-type') || 'audio/mpeg';

  const rawTranscript = await deepgramTranscribe(dgKey, audioBytes, mime);
  const summaryText = await groqSummarizeTranscript(gKey, rawTranscript);
  const parsed = parseSummary(summaryText);
  if (!parsed) throw new Error('Could not parse summary as JSON');

  const transcript = parsed.speaker_transcript || rawTranscript;

  await updateNote(note_id, {
    status: 'done',
    transcript,
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
  });

  return {
    ok: true,
    provider: 'deepgram-nova-2',
    transcript,
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
  };
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
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
  });

  return {
    ok: true,
    transcript: parsed.transcript || '',
    summary: parsed.summary || '',
    action_items: parsed.action_items || [],
    decisions: parsed.decisions || [],
    discussion_topics: parsed.discussion_topics || [],
    next_meeting: parsed.next_meeting || '',
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

  // Resolved per-step inside the handlers via groqKey() / geminiKey() /
  // deepgramKey() — each function picks the meeting-specific env var
  // first and falls back to the shared one when not set.
  const apiKey = geminiKey();

  let body;
  try { body = req.body; if (typeof body === 'string') body = JSON.parse(body); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  // Step routing — query string OR body field
  const step = (req.query?.step || body?.step || '').toLowerCase();

  try {
    let result;
    if (step === 'process') {
      // Primary: Groq Whisper + Groq LLM in a single call
      result = await stepProcess(body);
    } else if (step === 'upload') {
      result = await stepUpload(apiKey, body);
    } else if (step === 'poll') {
      result = await stepPoll(apiKey, body);
    } else if (step === 'generate') {
      result = await stepGenerate(apiKey, body);
    } else if (step === 'deepgram') {
      // Layer 3 fallback — Deepgram Nova-2 transcribe, Groq summarise
      result = await stepDeepgram(body);
    } else if (step === 'fallback') {
      // Backwards-compat alias — frontend used to call ?step=fallback
      // for the Whisper path; now process is canonical.
      result = await stepProcess(body);
    } else {
      return res.status(400).json({ error: 'step must be process|upload|poll|generate|deepgram' });
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
