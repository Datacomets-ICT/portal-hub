// Pipeline for the Ollama summary worker.
//
// Flow:
//   1. stripFiller         — regex-only, removes "เอ่อ อืม ครับๆ" noise
//   2. extractAttachmentText — pull text out of pdf / xlsx / docx / txt
//   3. buildPrompt         — combine meta + agenda + chat + files + audio
//                            transcript into a single prompt with the
//                            JSON schema the model should produce
//   4. chunkIfNeeded       — only kicks in if the prompt is genuinely too
//                            big for the model's context (qwen2.5 has
//                            128k tokens — most meetings fit in one shot)
//   5. callOllama          — POST to /api/chat with JSON format hint
//   6. mergeSummaries      — only used in the chunked path; combines mini
//                            summaries into the final structured object
//
// Designed to be pure-ish so the worker daemon can unit-test stages
// independently if needed.

import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// 1. Filler stripping — Thai + a few English. Run with /gi.
// ---------------------------------------------------------------------------
// Source: common spoken-Thai disfluencies. Kept conservative — we want to
// reduce noise, not erase actual speech. Whole-word match only.
const FILLER_PATTERNS = [
  /\b(เอ่อ|อืม|อ่า|เอ้อ|เออ|อ่ะ|อะ|อ่ะนะ|นะคะ|นะครับ|ครับๆ+|ค่ะๆ+)\b/gi,
  /\b(um+|uh+|err+|hmm+|like|you know|i mean)\b/gi,
];

export function stripFiller(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  for (const re of FILLER_PATTERNS) out = out.replace(re, '');
  // Collapse the gaps the regex leaves behind: multiple spaces, blank
  // commas (", ,"), repeated punctuation, leading/trailing space on
  // each line.
  out = out
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/([.!?])\1{2,}/g, '$1')
    .replace(/^\s+|\s+$/gm, '');
  return out;
}

// ---------------------------------------------------------------------------
// 2. Attachment text extraction — lazy imports so a broken parser kills
//    only its own file, not the whole run.
// ---------------------------------------------------------------------------
const PER_FILE_CHAR_CAP = 50_000;

function detectKind(fileName = '', mime = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (ext === 'pdf' || m.includes('pdf')) return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext) || m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet';
  if (['docx', 'doc'].includes(ext) || m.includes('wordprocessingml')) return 'docx';
  if (['txt', 'md', 'log'].includes(ext) || m.startsWith('text/')) return 'text';
  return 'unknown';
}

export async function extractAttachmentText(file, buf) {
  const kind = detectKind(file.file_name, file.mime_type);
  try {
    if (kind === 'pdf') {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const result = await pdfParse(buf);
      return (result.text || '').trim();
    }
    if (kind === 'sheet') {
      const XLSX = await import('xlsx');
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
      const mod = await import('mammoth');
      const mammoth = mod.default || mod;
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return (value || '').trim();
    }
    if (kind === 'text') {
      return buf.toString('utf8').trim();
    }
  } catch (err) {
    console.error(`extract failed for ${file.file_name}:`, err.message);
    return '';
  }
  return '';
}

export function capFileText(text) {
  if (!text) return { text: '', status: 'no-text' };
  if (text.length < 30) return { text: '', status: 'no-text' };
  if (text.length > PER_FILE_CHAR_CAP) {
    return {
      text: text.slice(0, PER_FILE_CHAR_CAP) + '\n... [ตัดท้ายเพราะไฟล์ยาว]',
      status: 'truncated',
    };
  }
  return { text, status: 'ok' };
}

// ---------------------------------------------------------------------------
// 3. Prompt building — single source of truth for what the model sees.
// ---------------------------------------------------------------------------
const SUMMARY_SCHEMA = `{
  "tldr": "สรุปย่อ 2-3 ประโยค ครอบคลุม หัวข้อหลัก ผลลัพธ์ที่ได้ และขั้นถัดไป",
  "context": "ภูมิหลัง 1-2 ประโยค ว่าทำไมการประชุมนี้สำคัญ / มีที่มาอย่างไร",
  "discussion_summary": "เรียบเรียงเป็นย่อหน้า 200-400 คำ ภาษาทางการแบบรายงานสำหรับผู้บริหาร เริ่มจากภาพรวม → รายละเอียดที่หารือ → ข้อสรุปและผลลัพธ์ ต้องอ่านลื่นเป็นย่อหน้าเดียว (ห้ามใช้ bullet)",
  "key_points": [
    "ประเด็นสำคัญแต่ละข้อให้เป็นประโยคเต็ม 1-2 ประโยค มีบริบทพอเข้าใจ ไม่ใช่แค่หัวข้อสั้น ๆ"
  ],
  "stakeholders": [
    {"name": "ชื่อผู้พูด/ผู้รับผิดชอบ", "role": "บทบาทในประชุมหรือในองค์กร", "contribution": "ประเด็นที่ผู้นี้เสนอ/แสดงความเห็น/ตัดสินใจ"}
  ],
  "decisions": [
    "ข้อตัดสินใจที่ทำในการประชุม อธิบายเหตุผลและผลที่คาดว่าจะตามมาด้วย"
  ],
  "action_items": [
    {"task": "งานที่ต้องทำ พร้อมขอบเขตที่ชัดเจน", "owner": "ชื่อผู้รับผิดชอบ", "due": "กำหนดเสร็จ ถ้ามี", "priority": "สูง | กลาง | ต่ำ"}
  ],
  "risks_concerns": [
    "ความเสี่ยง / ข้อกังวล / อุปสรรคที่ถูกหยิบยกในประชุม พร้อมคำอธิบายว่ามีผลอย่างไร"
  ],
  "metrics_mentioned": [
    "ตัวเลข / KPI / เป้าหมาย / กำหนดเวลา ที่กล่าวถึงในประชุม"
  ],
  "next_steps": [
    "ขั้นถัดไปที่ทีมต้องดำเนินการ พร้อมรายละเอียดว่าใครทำอะไรเมื่อไหร่"
  ]
}`;

const SYSTEM_PROMPT = `คุณคือ Senior Business Analyst ที่เขียน executive briefing ให้ผู้บริหารระดับสูง

หลักการเขียน:
1. ภาษาทางการ กระชับ ตรงประเด็น ไม่ใช้คำพูดในแชท
2. แต่ละ field ต้องมีเนื้อหาเพียงพอสำหรับผู้บริหารตัดสินใจได้
   - tldr: 2-3 ประโยค
   - discussion_summary: 200-400 คำ เป็นย่อหน้าเรียบเรียง ไม่ใช่ bullet
   - key_points: 5-8 ข้อ แต่ละข้อเป็น 1-2 ประโยคเต็ม มีบริบทพอเข้าใจ
3. วิเคราะห์ไม่ใช่ถอดคำพูด — มองหาประเด็นที่ซ่อนอยู่ (ความเสี่ยง · ผู้รับผิดชอบ · ตัวเลข · timeline)
4. แยกแยะ "พูดถึง" กับ "ตัดสินใจ" ให้ชัด — ตัดสินใจคือมีข้อสรุปร่วมกัน ไม่ใช่แค่หยิบยกขึ้นมา
5. action_items ต้องมี owner ชัด ถ้าไม่มีในต้นฉบับให้ใส่ "ยังไม่กำหนด" (ห้ามเดา)

หลักการตอบ:
- ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น
- ห้ามมีคำเกริ่นนำ ห้ามใช้ markdown ห้ามใช้ภาษาอังกฤษนอกจากชื่อเฉพาะ
- ใช้ข้อมูลจากต้นฉบับเท่านั้น ห้ามแต่งเพิ่ม
- ถ้าไม่มีข้อมูลในฟิลด์ใด ให้ส่ง array ว่าง [] (อย่าใส่ข้อความว่า "ไม่มีข้อมูล" ใน array)
- ทุก array field ที่มีข้อมูล ต้องมีอย่างน้อย 1 รายการที่เขียนเต็มประโยค`;

function fmtMin(m) {
  if (m == null) return '';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function buildPrompt(inputs, fileTexts = []) {
  const b = inputs.booking || {};
  const messages = inputs.messages || [];
  const attendees = inputs.attendees || [];
  const audio = inputs.audio_note || null;
  const agenda = Array.isArray(b.agenda) ? b.agenda : [];

  const lines = [];
  lines.push('สรุปการประชุมจากข้อมูลด้านล่าง รวมทุกแหล่งที่มี (meta + agenda + ผู้เข้าร่วม + แชท + เนื้อหาไฟล์แนบ + บันทึกเสียง) เป็นภาษาไทย');
  lines.push('');
  lines.push(`หัวข้อ: ${b.title || '-'}`);
  lines.push(`ผู้จัด: ${b.booker || '-'}`);
  lines.push(`วัตถุประสงค์: ${b.purpose || '-'}`);
  if (b.company) lines.push(`บริษัท/ลูกค้า: ${b.company}`);
  if (b.attendees) lines.push(`จำนวนผู้เข้าร่วมที่จองไว้: ${b.attendees} คน`);
  if (b.booking_date) lines.push(`วันที่: ${b.booking_date}`);
  if (b.start_min != null && b.end_min != null) {
    lines.push(`เวลา: ${fmtMin(b.start_min)}–${fmtMin(b.end_min)}`);
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
    for (const m of messages) {
      const body = stripFiller(m.body || '');
      if (body) lines.push(`  ${m.name || m.employee_id}: ${body}`);
    }
    lines.push('');
  } else {
    lines.push('(ไม่มีบทสนทนาในแชท ใช้ข้อมูลจากวาระ + meta สรุปแทน)');
  }

  const usable = fileTexts.filter((f) => f.text);
  if (usable.length) {
    lines.push('เนื้อหาไฟล์แนบ:');
    for (const f of usable) {
      lines.push(`--- ${f.file_name} ---`);
      lines.push(f.text);
      lines.push('');
    }
  }

  if (audio) {
    if (audio.duration_sec) {
      lines.push(`บันทึกเสียงประชุม (~${Math.round(audio.duration_sec / 60)} นาที):`);
    } else {
      lines.push('บันทึกเสียงประชุม:');
    }
    if (audio.transcript) {
      const cleaned = stripFiller(audio.transcript);
      const t = cleaned.length > 80_000 ? cleaned.slice(0, 80_000) + '\n... [ตัดท้าย]' : cleaned;
      lines.push('Transcript:');
      lines.push(t);
      lines.push('');
    }
    if (audio.summary) {
      lines.push('Summary จากตัวอัดเสียง (ใช้เป็น hint):');
      lines.push(typeof audio.summary === 'string' ? audio.summary : JSON.stringify(audio.summary));
      lines.push('');
    }
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('คำสั่ง: เขียน executive briefing เป็น JSON ตาม schema ด้านล่าง');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('แนวทางคุณภาพ:');
  lines.push('• discussion_summary คือหัวใจ — 200-400 คำ เรียบเรียงเป็นย่อหน้าเดียว ไม่ใช่ bullet');
  lines.push('  เริ่มจาก "การประชุมครั้งนี้..." ตามด้วยภาพรวม → รายละเอียด → ผลลัพธ์');
  lines.push('• key_points ต้องเขียนเต็มประโยค ไม่ใช่หัวข้อสั้น');
  lines.push('  ❌ "ปรับปรุงโค้ด"');
  lines.push('  ✅ "ทีมเสนอให้ปรับปรุงโค้ดดึงข้อมูลจาก FDA เพื่อให้รองรับ schema ใหม่ของกรม คาดว่าจะเสร็จภายในสัปดาห์หน้า"');
  lines.push('• แยก "พูดถึง" กับ "ตัดสินใจ" — เฉพาะที่มีข้อสรุปร่วมกัน ใส่ใน decisions');
  lines.push('• action_items ต้องมี owner — ถ้าไม่ได้ระบุในต้นฉบับ ใส่ "ยังไม่กำหนด"');
  lines.push('• risks_concerns / metrics_mentioned ถ้าไม่มีจริง ๆ ใส่ array ว่าง [] ห้ามแต่ง');
  lines.push('');
  lines.push('Schema:');
  lines.push(SUMMARY_SCHEMA);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Chunking — for transcripts that exceed the model's effective context.
//
// qwen2.5:14b advertises 128k tokens but quality degrades well before
// that. Trigger chunking when transcript char-length > 60k. We chunk
// only the transcript and keep meta/chat/files in every chunk so each
// mini-summary stays grounded.
// ---------------------------------------------------------------------------
const CHUNK_MAX_CHARS = 28_000;   // ~7k tokens per chunk, plenty of headroom
const CHUNK_OVERLAP   = 2_800;    // ~10%

export function chunkTranscript(transcript) {
  const t = stripFiller(transcript || '');
  if (t.length <= CHUNK_MAX_CHARS) return [t];

  const chunks = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(i + CHUNK_MAX_CHARS, t.length);

    // Prefer to cut at a paragraph or sentence boundary near `end` so we
    // don't slice mid-word. Look back up to 600 chars for one of these
    // markers; if none, just cut at `end`.
    if (end < t.length) {
      const window = t.slice(Math.max(i, end - 600), end);
      const breakIdx = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
      );
      if (breakIdx > 100) {
        end = Math.max(i, end - 600) + breakIdx + 1;
      }
    }

    chunks.push(t.slice(i, end).trim());
    if (end >= t.length) break;
    i = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 5. Ollama call. Uses /api/chat with `format: 'json'` so qwen returns
//    parseable JSON without us having to strip code fences.
// ---------------------------------------------------------------------------
export async function callOllama({ baseUrl, model, system, user, timeoutMs }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs || 240_000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        // num_predict: cap output ~3000 tokens — enough for a rich
        //   summary (discussion_summary alone can be 600-800 tokens).
        // num_ctx: bump context window so the full input + a long
        //   reply both fit (default 2048 is tiny).
        // temperature: 0.4 nudges narrative quality without straying
        //   from facts (0.3 was too terse).
        options: { temperature: 0.4, num_predict: 3000, num_ctx: 8192 },
        messages: [
          { role: 'system', content: system || SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
    });
  } finally {
    clearTimeout(tid);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.message?.content || '';
  try {
    return JSON.parse(content);
  } catch {
    // Fallback: model may have wrapped the JSON in stray text.
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return { tldr: content.slice(0, 280), key_points: [], decisions: [], action_items: [], next_steps: [] };
  }
}

// ---------------------------------------------------------------------------
// 6. Merge — combines several mini-summary objects into one. Plain JS,
//    no LLM, no token cost. Dedupes by trimmed text.
// ---------------------------------------------------------------------------
function dedupedConcat(arrays) {
  const seen = new Set();
  const out = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const key = typeof item === 'string'
        ? item.trim().toLowerCase()
        : JSON.stringify(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function mergeSummaries(parts) {
  const merged = {
    tldr: '',
    context: '',
    discussion_summary: '',
    key_points:        dedupedConcat(parts.map((p) => p.key_points)),
    stakeholders:      dedupedConcat(parts.map((p) => p.stakeholders)),
    decisions:         dedupedConcat(parts.map((p) => p.decisions)),
    action_items:      dedupedConcat(parts.map((p) => p.action_items)),
    risks_concerns:    dedupedConcat(parts.map((p) => p.risks_concerns)),
    metrics_mentioned: dedupedConcat(parts.map((p) => p.metrics_mentioned)),
    next_steps:        dedupedConcat(parts.map((p) => p.next_steps)),
  };
  // For scalar fields, prefer the first non-empty value across chunks.
  // Chunks overlap by ~10% so the first chunk usually has the strongest
  // intro / context. discussion_summary stays the first chunk's narrative
  // — a smarter merge would re-prompt the LLM to write a unified
  // narrative, but for now first-chunk + dedup'd bullets is acceptable.
  for (const p of parts) {
    if (!merged.tldr && p.tldr?.trim())                            merged.tldr = p.tldr.trim();
    if (!merged.context && p.context?.trim())                      merged.context = p.context.trim();
    if (!merged.discussion_summary && p.discussion_summary?.trim()) merged.discussion_summary = p.discussion_summary.trim();
    if (merged.tldr && merged.context && merged.discussion_summary) break;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 7. Top-level summarize — orchestrates the above.
// ---------------------------------------------------------------------------
export async function summarize({ inputs, fileTexts, ollama, log }) {
  const transcript = inputs.audio_note?.transcript || '';
  const longTranscript = transcript.length > CHUNK_MAX_CHARS * 1.5;

  // Common path — small enough to send in one shot.
  if (!longTranscript) {
    const prompt = buildPrompt(inputs, fileTexts);
    log?.(`single-call · prompt ${prompt.length} chars`);
    return await callOllama({
      baseUrl:   ollama.baseUrl,
      model:     ollama.model,
      user:      prompt,
      timeoutMs: ollama.timeoutMs,
    });
  }

  // Long-transcript path: map over chunks, then merge.
  const chunks = chunkTranscript(transcript);
  log?.(`chunked · ${chunks.length} chunks of ~${CHUNK_MAX_CHARS} chars`);
  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    const slicedInputs = {
      ...inputs,
      audio_note: { ...(inputs.audio_note || {}), transcript: chunks[i] },
    };
    const prompt = buildPrompt(slicedInputs, fileTexts);
    log?.(`  chunk ${i + 1}/${chunks.length} · prompt ${prompt.length} chars`);
    const result = await callOllama({
      baseUrl:   ollama.baseUrl,
      model:     ollama.model,
      user:      prompt,
      timeoutMs: ollama.timeoutMs,
    });
    partials.push(result);
  }
  return mergeSummaries(partials);
}
