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

const AUDIO_EXTS = [
  'mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'opus',
  'flac', 'wma', 'amr', '3gp', 'webm', 'mp4', 'm4b', 'mkv', 'mov',
];

function detectKind(fileName = '', mime = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (ext === 'pdf' || m.includes('pdf')) return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext) || m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet';
  if (['docx', 'doc'].includes(ext) || m.includes('wordprocessingml')) return 'docx';
  if (['txt', 'md', 'log'].includes(ext) || m.startsWith('text/')) return 'text';
  // Audio / audio-bearing video → transcribed via local whisper.cpp (stt.mjs).
  if (AUDIO_EXTS.includes(ext) || m.startsWith('audio/') || m.startsWith('video/')) return 'audio';
  return 'unknown';
}

export async function extractAttachmentText(file, buf, log = () => {}) {
  const kind = detectKind(file.file_name, file.mime_type);
  try {
    if (kind === 'audio') {
      // Local speech-to-text. Lazy import so a machine without the whisper
      // toolchain only fails on audio files, not every run.
      const { transcribeAudio } = await import('./stt.mjs');
      return await transcribeAudio(buf, file.file_name, log);
    }
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
  "tldr": "สรุปย่อ 2-3 ประโยค: ประชุมเรื่องอะไร ได้ข้อสรุป/ผลลัพธ์อะไร ขั้นถัดไปคืออะไร — ระบุสิ่งที่เป็นรูปธรรม (ชื่อระบบ/งาน/เครื่องมือ/ตัวเลข) ที่ปรากฏจริง ไม่พูดลอย ๆ",
  "topics_discussed": [
    "หัวข้อที่หารือ เป็นประโยคเต็มที่เจาะจง (ใคร–ทำอะไร–กับอะไร) ระบุชื่อสิ่งที่พูดถึงจริง ห้ามลอย ๆ เช่นห้ามเขียนแค่ 'หารือเรื่องการทำงาน' ต้องบอกว่าเรื่องอะไร (สูงสุด 5 ข้อ ไม่ซ้ำประเด็นเดียวกัน)"
  ],
  "decisions": [
    "เฉพาะมติที่ 'ตกลงร่วมกันจริง' (มีคำยืนยันในเนื้อหา เช่น ตกลง/สรุปว่า/เห็นชอบ) — ระบุว่าตัดสินใจอะไรเพื่ออะไร ถ้าแค่เสนอ/ยังถกไม่จบ อย่าใส่ที่นี่ (ไป pending_items)"
  ],
  "action_items": [
    {"task": "งานที่ต้องทำ เจาะจงและทำได้จริง", "owner": "ชื่อผู้รับผิดชอบตามที่เนื้อหาระบุ (ใครก็ได้) มิฉะนั้นใส่คำว่า ยังไม่กำหนด", "due": "กำหนดเสร็จเฉพาะถ้าเนื้อหาระบุจริง มิฉะนั้นเว้นว่าง"}
  ],
  "pending_items": [
    "ประเด็นที่ยกขึ้นมาแต่ยังไม่ได้ข้อสรุป / คำถามค้าง / รอตัดสินใจครั้งหน้า — ระบุให้ชัดว่าค้างเรื่องอะไร"
  ]
}`;

const SYSTEM_PROMPT = `คุณคือ Senior Business Analyst เขียน executive briefing ให้ผู้บริหารระดับสูง

⚠ กฎสำคัญที่สุด (ละเมิดไม่ได้):
• ใช้เฉพาะข้อมูลจาก input ที่ผู้ใช้ให้มา ห้ามแต่งเรื่อง ห้ามเดา ห้ามอ้างความรู้ทั่วไป
• หัวข้อในประชุม = สิ่งที่ปรากฏใน "บทสนทนา (แชท)" หรือ "Transcript เสียง" หรือ "เนื้อหาไฟล์แนบ" เท่านั้น
• ข้อมูล meta (หัวข้อการจอง / วัตถุประสงค์ / รายชื่อผู้เข้าร่วม) ใช้เป็นบริบทเท่านั้น ห้ามนำมาแต่งเป็นเนื้อหาประชุม
• ถ้าไม่มีบทสนทนา/transcript/เอกสารใน input — ทุกฟิลด์ต้องเป็น array ว่าง [] หรือ tldr บอกว่า "ไม่มีข้อมูลเพียงพอสำหรับสรุป"
• ❌ ห้ามอ้าง: FDA, schema, ระบบ, โครงการ, deadline, ตัวเลข, ชื่อบริษัท/หน่วยงาน ที่ไม่ได้ปรากฏใน input
• ❌ ห้ามใช้คำเช่น "ทีมเสนอ" "ที่ประชุมตกลง" ถ้าไม่ได้มี text จริง ๆ ที่บอกแบบนั้น

โครงสร้างผลลัพธ์ (บังคับ 4 หัวข้อ):
1. topics_discussed   — หัวข้อหลักที่หารือ (สูงสุด 5 ข้อ ประโยคเต็ม)
2. decisions          — มติ / ข้อตัดสินใจ (เฉพาะที่สรุปจริง)
3. action_items       — สิ่งที่ต้องทำต่อ ในรูปแบบตาราง: งาน / ผู้รับผิดชอบ / กำหนดเสร็จ
4. pending_items      — ประเด็นค้างคา / ต้องตัดสินใจต่อ (ถ้ามี)

หลักการเขียน (เน้นความคม + เจาะจง):
• เจาะจงเสมอ — ดึงสิ่งที่เป็นรูปธรรมจากเนื้อหา: ชื่อระบบ/เครื่องมือ/คน/ไฟล์/ตัวเลข/วันเวลา ที่ "ปรากฏจริง" ใส่ลงไป ห้ามสรุปลอย ๆ แบบ "หารือเรื่องการทำงาน / ปรับปรุงระบบ" โดยไม่บอกว่าอะไร
• ภาษาทางการ กระชับ ตรงประเด็น เหมือนรายงานผู้บริหาร — แต่ละข้อกินใจความ ไม่น้ำเยอะ ไม่ซ้ำกัน
• topics_discussed สูงสุด 5 ข้อ เลือกที่สำคัญสุด ไม่แตกประเด็นเดียวเป็นหลายข้อ
• decisions = มติที่ตกลงจริง (มีคำยืนยันในเนื้อหา) เท่านั้น — ถ้าแค่เสนอ/ยังถกอยู่ ให้ไป pending_items
• action_items: task เจาะจงทำได้จริง · owner = ชื่อในเนื้อหา (ใครก็ได้ ไม่จำกัดผู้เข้าร่วม) ถ้าไม่ระบุใส่ "ยังไม่กำหนด" (ห้ามเดา) · due ใส่เฉพาะที่ระบุจริง
• pending_items = เรื่องค้าง/คำถามที่ยังไม่จบ — ระบุให้ชัดว่าค้างเรื่องอะไร

หลักการตอบ:
- ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น
- ห้ามมีคำเกริ่นนำ ห้ามใช้ markdown ห้ามใช้ภาษาอังกฤษนอกจากชื่อเฉพาะที่อยู่ใน input
- ถ้า input บางมาก (เช่น มีแค่หัวข้อ + รายชื่อ) — tldr ต้องบอกตรง ๆ ว่า "ไม่มีบทสนทนา/เอกสาร — สรุปไม่ได้"`;

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

  // Show who actually attended (status: 'joined' | 'invited' | 'declined') as
  // context. NOTE: an action-item owner does NOT have to be one of these — the
  // transcript may assign a task to someone who wasn't in the room. Owners come
  // from what the content actually says; this list is just background.
  const joined = attendees.filter((a) => a.status === 'joined');
  if (joined.length) {
    lines.push('ผู้เข้าร่วมประชุมจริง (ใช้เป็นบริบท):');
    for (const a of joined) {
      const who = a.nickname ? `${a.name || a.employee_id} (${a.nickname})` : (a.name || a.employee_id);
      lines.push(`  - ${who}`);
    }
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
      const ext = (f.file_name.split('.').pop() || '').toLowerCase();
      const label = AUDIO_EXTS.includes(ext)
        ? `${f.file_name} — ถอดความจากไฟล์เสียงที่บันทึกในห้องประชุม (transcript)`
        : f.file_name;
      lines.push(`--- ${label} ---`);
      lines.push(f.text);
      lines.push('');
    }
  }

  if (audio) {
    const hasTranscript = !!audio.transcript;
    const hasSummary = !!audio.summary;
    if (audio.duration_sec) {
      lines.push(`บันทึกเสียงประชุม (~${Math.round(audio.duration_sec / 60)} นาที):`);
    } else {
      lines.push('บันทึกเสียงประชุม:');
    }
    if (hasTranscript) {
      const cleaned = stripFiller(audio.transcript);
      const t = cleaned.length > 80_000 ? cleaned.slice(0, 80_000) + '\n... [ตัดท้าย]' : cleaned;
      lines.push('Transcript:');
      lines.push(t);
      lines.push('');
    }
    if (hasSummary) {
      lines.push('Summary จากตัวอัดเสียง (ใช้เป็น hint):');
      lines.push(typeof audio.summary === 'string' ? audio.summary : JSON.stringify(audio.summary));
      lines.push('');
    }
    // mp3 ที่ถอดเสียงไม่สำเร็จ: มีไฟล์เสียงแต่ไม่มี transcript/summary
    // ให้บอกโมเดลตรง ๆ ว่าไม่มีเนื้อหา ห้ามเดา — ไม่งั้นมันจะแต่งเรื่องในไฟล์เสียงเอง
    if (!hasTranscript && !hasSummary) {
      lines.push('(ถอดเสียงไม่สำเร็จ — ไม่มี transcript จากไฟล์เสียงนี้ ห้ามเดา/แต่งเนื้อหาที่พูดในไฟล์เสียง)');
      lines.push('');
    }
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('คำสั่ง: เขียน executive briefing เป็น JSON 4 หัวข้อต่อไปนี้');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('แนวทางคุณภาพ:');
  lines.push('• topics_discussed สูงสุด 5 ข้อเท่านั้น — เลือกที่สำคัญที่สุด');
  lines.push('  เขียนเต็มประโยคมีบริบท ไม่ใช่หัวข้อสั้น ตามโครงนี้:');
  lines.push('  ❌ สั้นเกินไป ไม่มีบริบท: "[หัวข้อ]"');
  lines.push('  ✅ เต็มประโยค: "[ใคร] [เสนอ/หารือ/ตกลง] [ทำอะไร] เพื่อ [เป้าหมาย] [รายละเอียด/กรอบเวลา ถ้ามี]"');
  lines.push('  ⚠ วงเล็บ [...] คือช่องว่างให้เติม — ห้ามคัดลอกคำใน [...] หรือคำในโครงตัวอย่างลงผลลัพธ์ ต้องแทนด้วยข้อมูลจริงจาก input เท่านั้น');
  lines.push('• decisions เฉพาะมติร่วมที่สรุปจริง — ไม่ใช่แค่หยิบยก/เสนอ');
  lines.push('• action_items: owner = ชื่อผู้รับผิดชอบตามที่เนื้อหา/ไฟล์ระบุ');
  lines.push('  เป็นใครก็ได้ที่ถูกพูดถึง (ไม่จำเป็นต้องเป็นผู้เข้าร่วม) — ถ้าไม่ได้ระบุชัด ใส่ "ยังไม่กำหนด" (ห้ามเดาชื่อ)');
  lines.push('• pending_items คือเรื่องที่ค้างไว้ ยังไม่ตัดสินใจ ต้องคุยครั้งหน้า');
  lines.push('• ถ้าหัวข้อใดไม่มีข้อมูลจริง — ใส่ array ว่าง [] ห้ามแต่งให้ครบ');
  lines.push('');
  lines.push('Schema (ตอบเป็น JSON ตรงตามนี้):');
  lines.push(SUMMARY_SCHEMA);
  return lines.join('\n');
}

// Like buildPrompt but for ONE slice of a large meeting's content (long
// transcript and/or long documents). Keeps the meta as grounding context and
// asks the model to summarize just this slice; slices are merged afterwards.
export function buildChunkPrompt(inputs, contentChunk, idx, total) {
  const b = inputs.booking || {};
  const attendees = inputs.attendees || [];
  const agenda = Array.isArray(b.agenda) ? b.agenda : [];

  const lines = [];
  lines.push(`สรุป "เนื้อหาส่วนที่ ${idx}/${total}" ของการประชุมด้านล่าง (เป็นบางส่วนของการประชุมเดียวกัน) เป็นภาษาไทย`);
  lines.push('');
  lines.push(`หัวข้อ: ${b.title || '-'}`);
  if (b.purpose) lines.push(`วัตถุประสงค์: ${b.purpose}`);
  if (b.company) lines.push(`บริษัท/ลูกค้า: ${b.company}`);
  lines.push('');

  if (agenda.length) {
    lines.push('วาระการประชุม:');
    for (const a of agenda) lines.push(`  - ${a.text || ''}${a.done ? ' [✓]' : ''}`);
    lines.push('');
  }

  const joined = attendees.filter((a) => a.status === 'joined');
  if (joined.length) {
    lines.push('ผู้เข้าร่วมประชุมจริง (ใช้เป็นบริบท):');
    for (const a of joined) {
      const who = a.nickname ? `${a.name || a.employee_id} (${a.nickname})` : (a.name || a.employee_id);
      lines.push(`  - ${who}`);
    }
    lines.push('');
  }

  lines.push(`── เนื้อหาส่วนที่ ${idx}/${total} ──`);
  lines.push(contentChunk);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('คำสั่ง: สรุป "เฉพาะข้อมูลที่ปรากฏในเนื้อหาส่วนนี้" เป็น JSON 4 หัวข้อ ห้ามแต่งข้อมูลที่ไม่มี');
  lines.push('• action_items: owner = ชื่อผู้รับผิดชอบตามที่เนื้อหาระบุ (เป็นใครก็ได้) ถ้าไม่ระบุใส่ "ยังไม่กำหนด"');
  lines.push('• หัวข้อใดไม่มีข้อมูลในส่วนนี้ ใส่ array ว่าง []');
  lines.push('');
  lines.push('Schema (ตอบเป็น JSON ตรงตามนี้):');
  lines.push(SUMMARY_SCHEMA);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Chunking — for content that exceeds the model's effective context.
//
// qwen2.5:14b advertises 128k tokens but quality degrades well before
// that. Trigger chunking when transcript char-length > 60k. We chunk
// only the transcript and keep meta/chat/files in every chunk so each
// mini-summary stays grounded.
// ---------------------------------------------------------------------------
// Chunking is a RELIABILITY net for very large meetings, not a speed trick:
// splitting into N calls adds more total LLM overhead than one call, so we only
// reach for it when a single prompt would overflow the model's context and
// produce garbage (as a ~29k-char transcript did before). ~8k-char chunks keep
// each call's context manageable.
const CHUNK_MAX_CHARS = 8_000;
const CHUNK_OVERLAP   = 800;      // ~10%

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

  // Size the context to the actual prompt. A 6 GB GPU spills the model to CPU
  // (and gets much slower) when num_ctx is bigger than weights + KV cache can
  // fit — so don't pad it. ~1 token/char is a safe upper bound for Thai; +2500
  // for the answer; rounded up to a sane bucket. Small jobs stay fully on GPU.
  const promptChars = (user?.length || 0) + ((system || SYSTEM_PROMPT)?.length || 0);
  const numCtx = [4096, 8192, 16384, 24576, 32768].find((c) => promptChars + 2500 <= c) || 32768;

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
        // num_ctx: sized per-prompt (numCtx above) so small jobs keep the whole
        //   model on the GPU instead of spilling to CPU. num_predict caps output
        //   ~2500 tokens (enough for the 4-section JSON). temperature 0.4 reads
        //   naturally; 0.3 was too terse.
        options: { temperature: 0.4, num_predict: 2500, num_ctx: numCtx },
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
    // Pure failure — log enough of the raw content to debug, and return
    // a stub that matches the NEW 4-section schema so the UI doesn't
    // render orphan fields. done_reason and length usually expose
    // truncation issues (context overflow, hit num_predict).
    console.error('[ollama] JSON parse failed. Length:', content.length,
                  'preview:', content.slice(0, 300).replace(/\s+/g, ' '),
                  'done_reason:', data?.done_reason,
                  'eval_count:', data?.eval_count);
    return {
      tldr: `(สรุปไม่สำเร็จ — model output ไม่ใช่ JSON ที่ถูกต้อง · ${content.length} chars)`,
      topics_discussed: [],
      decisions: [],
      action_items: [],
      pending_items: [],
    };
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
    // Cap topics at 5 even after merging chunks — schema says max 5.
    topics_discussed: dedupedConcat(parts.map((p) => p.topics_discussed)).slice(0, 5),
    decisions:        dedupedConcat(parts.map((p) => p.decisions)),
    action_items:     dedupedConcat(parts.map((p) => p.action_items)),
    pending_items:    dedupedConcat(parts.map((p) => p.pending_items)),
  };
  // First non-empty TL;DR wins (chunks overlap; the first chunk usually
  // has the strongest opening). Could re-prompt for a unified TL;DR if
  // quality demands, but first-chunk is fine.
  for (const p of parts) {
    if (p.tldr?.trim()) { merged.tldr = p.tldr.trim(); break; }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 7. Top-level summarize — orchestrates the above.
// ---------------------------------------------------------------------------
// Minimum content threshold (chars) below which we refuse to call the LLM
// and return a clear "not enough data" stub instead. Small models like
// qwen2.5:7b WILL hallucinate confidently when given just a title + purpose.
// 300 chars ≈ ~3-5 sentences of actual meeting content.
const MIN_CONTENT_CHARS = 300;

function totalUsableContent(inputs, fileTexts) {
  const transcript = (inputs.audio_note?.transcript || '').trim();
  const chat = (inputs.messages || []).reduce((s, m) => s + (m?.body || '').length, 0);
  const files = (fileTexts || []).reduce((s, f) => s + (f?.text || '').length, 0);
  const agenda = (Array.isArray(inputs.booking?.agenda) ? inputs.booking.agenda : [])
    .reduce((s, a) => s + (a?.text || '').length, 0);
  return transcript.length + chat + files + agenda;
}

export async function summarize({ inputs, fileTexts, ollama, log }) {
  // Sparse-input guard: when there's basically no content to summarize,
  // hand back a clear "not enough data" message instead of inviting the
  // model to make things up. Booker meta (title / purpose / attendee
  // count) doesn't count — that's not meeting content.
  const usable = totalUsableContent(inputs, fileTexts);
  log?.(`usable content: ${usable} chars`);
  if (usable < MIN_CONTENT_CHARS) {
    log?.(`SKIP llm · content too sparse (< ${MIN_CONTENT_CHARS} chars)`);
    return {
      tldr: 'ข้อมูลไม่เพียงพอสำหรับสรุปอัตโนมัติ — กรุณาแนบไฟล์เสียงประชุม อัปโหลดเอกสารงาน หรือเพิ่มวาระการประชุม แล้วลองสร้างใหม่อีกครั้ง',
      topics_discussed: [],
      decisions: [],
      action_items: [],
      pending_items: [],
      _sparse_input: true,
      _usable_chars: usable,
    };
  }

  // Assemble the full body content (audio transcript + chat + document text).
  // This is the bulk that can exceed one GPU-friendly context — chunk it if big.
  const transcript = (inputs.audio_note?.transcript || '').trim();
  const chatText = (inputs.messages || [])
    .filter((m) => (m?.body || '').trim())
    .map((m) => `${m.name || m.employee_id}: ${m.body.trim()}`)
    .join('\n');
  const docParts = (fileTexts || [])
    .filter((f) => f.text)
    .map((f) => `[ไฟล์: ${f.file_name}]\n${f.text}`);
  const corpus = [transcript, chatText, ...docParts].filter(Boolean).join('\n\n');

  // Stay single-call until the prompt would push num_ctx past the level that
  // still works on the GPU (~24k ctx). One call beats many for anything that
  // fits — chunking only wins when a single call would overflow and fail.
  const SINGLE_CALL_LIMIT = 18_000;

  // Common path — small enough to send in one shot (the rich buildPrompt).
  if (corpus.length <= SINGLE_CALL_LIMIT) {
    const prompt = buildPrompt(inputs, fileTexts);
    log?.(`single-call · prompt ${prompt.length} chars`);
    return await callOllama({
      baseUrl:   ollama.baseUrl,
      model:     ollama.model,
      user:      prompt,
      timeoutMs: ollama.timeoutMs,
    });
  }

  // Large meeting (long transcript and/or long documents): split the combined
  // content into chunks, summarize each with the meta as grounding, then merge.
  // Small per-call context keeps the model on the GPU (fast) instead of
  // spilling to CPU — so a big meeting becomes a few quick calls.
  const chunks = chunkTranscript(corpus);
  log?.(`chunked · ${chunks.length} chunks of ~${CHUNK_MAX_CHARS} chars (corpus ${corpus.length})`);
  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    const prompt = buildChunkPrompt(inputs, chunks[i], i + 1, chunks.length);
    log?.(`  chunk ${i + 1}/${chunks.length} · prompt ${prompt.length} chars`);
    partials.push(await callOllama({
      baseUrl:   ollama.baseUrl,
      model:     ollama.model,
      user:      prompt,
      timeoutMs: ollama.timeoutMs,
    }));
  }
  return mergeSummaries(partials);
}
