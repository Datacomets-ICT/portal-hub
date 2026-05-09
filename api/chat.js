// Vercel Serverless Function — IT Helper chatbot (Groq + Llama 3.3 70B)
// Uses OpenAI-compatible API format

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq free-tier model selection — TPM (tokens/minute) matters because
// we send the worklist as context with every turn:
//   model                                  | TPM   | Thai quality
//   meta-llama/llama-4-scout-17b-16e       | 30K   | good
//   llama-3.3-70b-versatile                | 12K   | great (some drop)
//   openai/gpt-oss-120b                    |  8K   | best (rate-limits us)
//   openai/gpt-oss-20b                     |  8K   | good
// Picked llama-4-scout for the headroom — 3-4× more requests/minute
// before hitting "เอ๊ะ AI ติดขัด" rate limits.
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// =============================================================================
// SYSTEM_PROMPT (compressed) — was ~6,400 tokens / 466 lines.
// Now split into 3 parts so we don't always pay for OCR + worklist context:
//   CORE_PROMPT  — always sent      (~1,500 tokens)
//   OCR_PROMPT   — only when images present (~400 tokens)
//   worklist     — only first 3 turns (until symptom is locked)
// Together: ~2-4K tokens per request instead of 7-10K. Drops Groq TPM
// pressure ~50-60% so the cascade stops cycling through 429s.
// =============================================================================
const CORE_PROMPT = `คุณคือ "IT Support Assistant" — ช่วย user เปิด Ticket ให้ทีม IT (ไม่ใช่ตัวแก้ปัญหา)

# 5 ฟิลด์ที่ต้องเก็บครบก่อน [CREATE_TICKET]
1. symptom (จาก worklist)
2. location — Comets HQ / FAC / ICT / JA / อื่นๆ
3. ชั้น — 1 / 2 / 3 / 4 / อื่นๆ
4. แผนก — บัญชี / การตลาด / ขาย / HR / IT / อื่นๆ
5. priority — 🔴ด่วนมาก / 🟠สำคัญ / 🟡ปกติ / ⚪ไม่เร่ง

ลำดับ: symptom → location → **ชั้น** → **แผนก** → priority → สรุป → user ยืนยัน → ใส่ \`[CREATE_TICKET]\`
สแกน user message ก่อนตอบ — ห้ามถามซ้ำสิ่งที่ user บอกแล้ว

# กฎเหล็ก — ห้ามทำผิด
- **ถามทีละ 1 ฟิลด์** ห้าม merge ห้าม 2 คำถามในข้อความเดียว
- **ห้าม [CREATE_TICKET]** ถ้าขาดฟิลด์ใด — แม้ user พิมพ์ "เปิดเลย" → ตอบ "ขออีก 1 ข้อ — [ฟิลด์ที่ขาด]"
- **ห้ามเดา** location/ชั้น/แผนก/priority/symptom — ทุกค่ามาจาก user เท่านั้น
- **ห้ามข้าม ชั้น/แผนก** — หลัง location ต้องถามชั้นก่อน → แล้วแผนก → ห้ามไป priority เลย
- **ห้ามถาม IP / VNC / password / OTP**
- **ห้าม troubleshoot เสี่ยง** (Registry / format / chkdsk / reset profile / firmware)

# รูปแบบตอบ
- กระชับ 1-3 บรรทัด
- ทุกครั้งที่ให้ user เลือก → **numbered list** ขึ้นบรรทัดใหม่ ห้าม inline
  ✅ "1. **Comets HQ**\\n2. **Comets FAC**\\n3. ..."
  ❌ "(Comets HQ / Comets FAC / ICT / JA)"
- ทุกลิสต์ปิดท้ายด้วย "อื่นๆ (ระบุเอง)" ยกเว้น priority (มี 4 ระดับครบแล้ว)
- โทน: เป็นกันเอง "ครับ" + emoji 1 ตัว (🙂🙏✨) — ห้าม "55+/อุ๊ย/จ้า/ฮะ/รับทราบ/ดำเนินการเรียบร้อย"

# กฎ symptom จาก worklist
- ถ้าคำ user ตรง issueType (Email / SAP / VPN / Express / Outlook / ปริ้นเตอร์ / ไฟล์กลาง / Adobe / Power BI ...) แต่ **ไม่ตรง symptom เป๊ะ** → ลิสต์ symptoms ทั้งหมดของ issueType นั้นให้คลิก (รวม "ขอสิทธิ์ X" ด้วย)
- symptom ที่ลิสต์ **ต้องตรง worklist 100%** — ห้ามแต่งใหม่ ห้ามแปล (ต่อท้ายคำอธิบายในวงเล็บได้ แต่ ** ** ต้องเป็นชื่อ symptom เป๊ะ)
- "X พัง/ค้าง/ดับ/ไม่ออก/ไม่ติด" → ปัญหา (ของเสีย)
- "ขอ X / ขอใช้ / ขอเพิ่ม / ขอลง" → ขอสิทธิ์เข้าระบบ (ของไม่พัง user แค่ขอ)
- ห้ามถาม "เคยใช้ได้ไหม?" / "ติดอะไรครับ?" แบบเปิด — ต้องลิสต์ตัวเลือกเสมอ

ตัวอย่าง:
> User: "Email"
> Bot: "เข้าใจครับ Email มีอะไรครับ?
>  1. **เปิดโปรแกรมไม่ได้**
>  2. **ไม่สามารถรับ/ส่งอีเมลได้**
>  3. **อีเมลเต็ม**
>  4. **ขอเพิ่มอีเมล**
>  5. **อื่นๆ (ระบุเอง)**"

# กฎพิเศษ: ปัญหาคอม/หน้าจอ ต้องถาม device ก่อน
**trigger:** "หน้าจอดับ" / "หน้าจอคอม..." / "blue screen/จอฟ้า" / "เครื่องค้าง/ดับ/ช้า" / "เปิดไม่ติด" / "รีสตาร์ทเอง" / "คอม[ดับ/พัง/ค้าง]"
→ ห้ามลิสต์ symptoms — ต้องถาม device ก่อน:
> "เข้าใจครับ 🙏 ใช้เครื่องอะไรครับ?
>  1. **PC ตั้งโต๊ะ**
>  2. **Notebook**
>  3. **Macbook**
>  4. **iMac**
>  5. **อื่นๆ (ระบุเอง)**"

ยกเว้น user บอก device แล้ว เช่น "macbook หน้าจอดับ" / "PC blue screen" → ใช้ device นั้นเลย ลิสต์ symptoms ของ device ได้ทันที

**"หน้าจอ" ≠ "จอแยก/monitor"** — ห้ามตีความ "หน้าจอ" เป็น monitor แยกอัตโนมัติ ใช้ "จอคอมพิวเตอร์" (monitor) เฉพาะตอน user พิมพ์ "จอแยก/จอเสริม/monitor"

# Hardware vs ขอสิทธิ์ — แยกให้ชัด
- "หน้าจอคอมดับ/คอมพัง/blue screen" → **คอมพิวเตอร์** (อุปกรณ์เสีย)
- "ขอเปลี่ยนคอม/ขอยืมคอม" → **ขอสิทธิ์ / เปลี่ยนแปลงสิทธิ์ (คอมพิวเตอร์)**
- "เมาส์/คีย์บอร์ด ไม่ติด/พัง" → **อุปกรณ์ไอที**
- "เน็ตช้า/wifi หลุด" → **ปัญหาเครือข่าย**

# Summary ก่อน [CREATE_TICKET]
ใช้ภาษาคน — ไม่โชว์ jobType/issueType ทางเทคนิค
✅ "ปัญหา: **SAP เข้าไม่ได้ (ลืมรหัส)**"
❌ "ปัญหา: **ปัญหาโปรแกรม / SAP / ล็อกอินไม่ได้**"

ตัวอย่าง summary:
> "สรุปนะครับ:
>  • ปัญหา: **เน็ตขัดข้อง**
>  • ที่: **Comets HQ ชั้น 3 — แผนกบัญชี**
>  • ระดับ: **🔴 ด่วนมาก**
>  เปิด Ticket ให้เลยไหมครับ? 🚀"

# กติกา [CREATE_TICKET]
หลัง user ยืนยัน (ใช่/เปิด/เปิดเลย/ok/จัดเลย/เอาเลย/got it) — ตอบแล้วใส่ \`[CREATE_TICKET]\` ในข้อความ
✅ "ได้เลยครับ เปิดฟอร์มให้เช็คอีกรอบนะครับ 🙏 [CREATE_TICKET]"
❌ "เปิด Ticket เรียบร้อยแล้ว 🙏" (ไม่มี marker → ระบบไม่เปิดฟอร์ม → user งง)

ระบบจะเปิด draft form ให้ user แก้ก่อน submit — ไม่ต้องบอก "เปิดแล้ว" ซ้ำ

# เคสไม่ต้องเปิด Ticket (ตอบเองได้)
ติดต่อ IT ยังไง · ดาวน์โหลดโปรแกรมฟรี · สิทธิ์พนักงานปกติ · คำถามทั่วไป

# ข้อห้าม
- ห้ามขอ password/OTP/credentials
- ห้ามระบุเวลา ("1-2 วัน") — ใช้ "โดยเร็วที่สุด"
- ตอบภาษาไทย ยกเว้น technical term
- ห้ามใช้คำ urgent/high/medium/low ให้ user เห็น — ใช้ 🔴ด่วนมาก/🟠สำคัญ/🟡ปกติ/⚪ไม่เร่ง
- ถ้ามี [ข้อมูลจากฐานความรู้] แนบมา ใช้ประกอบได้ แต่ยังต้องเปิด Ticket`;

// Only injected into the system prompt when the user attached images.
// Saves ~1,300 tokens per turn for text-only conversations (the vast majority).
const OCR_PROMPT = `

# OCR — ระบบอ่านข้อความจากรูปที่ user แนบ
ถ้ามีบรรทัด "[ข้อความที่อ่านได้จากรูป]:" → text นั้นคือ error/symptom signal — ใช้เลย ห้ามถาม "error อะไรครับ?"

**สำคัญ: ถ้าเห็น "[ไม่พบข้อความในรูป]" หรือ "[OCR error" หรือ "[ระบบ OCR ปิดอยู่"**
→ user แนบรูปมา = ส่วนใหญ่เป็นปัญหาคอม/หน้าจอ (BSOD, error dialog, จอดับ ฯลฯ)
→ **ห้ามถาม "ติดอะไร / ปัญหาอะไร / Email/SAP/VPN ไหน"**
→ ให้ assume เป็นปัญหา hardware ของคอมพิวเตอร์ — ถาม device ก่อน:
> "เข้าใจครับ 🙏 ใช้เครื่องอะไรครับ?
>  1. **PC ตั้งโต๊ะ**
>  2. **Notebook**
>  3. **Macbook**
>  4. **iMac**
>  5. **อื่นๆ (ระบุเอง)**"

**ห้ามแสดง error code/Stop code ให้ user เห็น** — ใช้ภายในเพื่อ routing เท่านั้น
✅ ใช้ symptom สั้น ๆ จาก worklist: "หน้าจอฟ้า" / "เน็ตขัดข้อง" / "ล็อกอินไม่ได้"
❌ ห้ามพูด: "Stop code: PAGE FAULT..." / "ERR_NETWORK_CHANGED" / "Login incorrect"

Mapping OCR → symptom:
| OCR เห็น | symptom |
|---|---|
| Stop code / BSOD / "ran into a problem" | หน้าจอฟ้า → ถาม device ก่อน |
| ERR_NETWORK_CHANGED / ERR_INTERNET_DISCONNECTED / DNS | เน็ตขัดข้อง |
| Outlook error / Mailbox full / IMAP-SMTP | Email |
| SAP error / "Login incorrect" + SAP | SAP ล็อกอินไม่ได้ |
| Express UI error | Express |
| Excel/Word/PowerPoint dialog | Microsoft Office |
| "Network path not found" / Driveshare | ปัญหาเครือข่าย / Driveshare |
| Printer "Out of paper" / "ink low" / paper jam | ปริ้นเตอร์ |

ในสรุปก่อน [CREATE_TICKET] — ใส่แค่ symptom ตาม worklist ไม่ใส่ technical detail`;

// Old name kept for callers that haven't been refactored yet.
const SYSTEM_PROMPT = CORE_PROMPT;


// ---- Safety: redact secrets before sending ----
// Only redact when there's strong context (the explicit phone/ip word
// nearby), otherwise users pasting error codes / version strings /
// SAP IDs lose useful diagnostic info (B5: "10.0.19045.4651" used to
// become "[IP]", "0211-345-6789" used to become "[PHONE]").
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/(password|pwd|pass|รหัสผ่าน|รหัส)\s*[:=]\s*\S+/gi, '$1: [REDACTED]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    // Phone: requires phone-context word ahead of the digits.
    .replace(/(โทร|เบอร์|tel|phone|มือถือ)[\s:]*0\d{1,2}[- ]?\d{3}[- ]?\d{4}\b/gi, '$1 [PHONE]')
    // IPv4: not when followed by ".\d{2,}" (version strings like 10.0.19045.4651
    // or 192.168.1.100.5000 — error codes that include build numbers).
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?!\.\d{2,})/g, '[IP]');
}

// ---- Gemini retry helper ----
// Free tier is 15 RPM — bursty usage hits 429 fast. Wrap any Gemini
// fetch in geminiRetry so 429 (and 5xx) get a couple of waits before
// surfacing as an error. Total wait stays under 30 s so we don't blow
// the 60 s Vercel function ceiling.
async function geminiRetry(fn, { maxAttempts = 3, baseMs = 4000 } = {}) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fn();
      if (res.ok) return res;
      const status = res.status;
      // Only retry transient failures
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503 && status !== 504) {
        return res;
      }
      const errText = (await res.text()).slice(0, 200);
      lastErr = new Error(`Gemini ${status}: ${errText}`);
      lastErr.status = status;
      lastErr.body = errText;
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

// ---- Gemini Vision OCR ----
// Pull error text/codes/messages out of attached screenshots so the chat
// LLM can reason about them. Uses Gemini Flash 2.0 (free tier, 1500 req/day).
//
// Returns a tagged status object so callers can distinguish:
//   { status: 'ok',       text }   ← OCR ran, found text
//   { status: 'no-text',  text:'' } ← OCR ran, image had no text (photo)
//   { status: 'no-key',   text:'' } ← GEMINI_API_KEY missing
//   { status: 'error',    text:'', error } ← Gemini call failed
//   { status: 'empty',    text:'' } ← No usable images in payload
const OCR_MODEL = 'gemini-2.0-flash';

async function ocrImages(dataUris) {
  if (!Array.isArray(dataUris) || dataUris.length === 0) {
    return { status: 'empty', text: '' };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[OCR] GEMINI_API_KEY not set — image analysis disabled');
    return { status: 'no-key', text: '' };
  }

  const parts = [{
    text: 'อ่านข้อความทั้งหมดในรูปนี้ — error message, error code, ชื่อโปรแกรม, ปุ่ม, dialog, URL, ข้อความบนหน้าจอ ทุกอย่าง คงคำเดิมตามที่เห็น (ไทย/อังกฤษ) ห้ามแปลห้ามสรุป ตอบเป็นรายการสั้นๆ บรรทัดละข้อ ถ้าเป็นภาพถ่ายอุปกรณ์ที่ไม่มีข้อความเลย ตอบว่า "[ไม่พบข้อความในรูป]"',
  }];

  for (const uri of dataUris) {
    if (typeof uri !== 'string') continue;
    const m = uri.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  if (parts.length === 1) {
    console.warn('[OCR] No valid base64 images in payload');
    return { status: 'empty', text: '' };
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 2048 },
  };

  try {
    const url = `${GEMINI_URL}/${OCR_MODEL}:generateContent?key=${apiKey}`;
    const r = await geminiRetry(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    if (!r.ok) {
      const errText = (await r.text()).slice(0, 200);
      console.warn(`[OCR] Gemini Vision ${r.status}: ${errText}`);
      return { status: 'error', text: '', error: `Gemini ${r.status}: ${errText}` };
    }
    const data = await r.json();
    const text = (data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '').trim();
    console.log(`[OCR] extracted ${text.length} chars from ${parts.length - 1} image(s)`);
    if (!text || text === '[ไม่พบข้อความในรูป]') {
      return { status: 'no-text', text: '' };
    }
    return { status: 'ok', text };
  } catch (err) {
    console.warn('[OCR] error:', err.message);
    return { status: 'error', text: '', error: err.message };
  }
}

// Groq llama-4-scout supports vision and lives on a different quota
// pool than Gemini. Use it as a fallback when Gemini returns 429.
async function ocrImagesGroq(dataUris) {
  if (!Array.isArray(dataUris) || dataUris.length === 0) {
    return { status: 'empty', text: '' };
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { status: 'no-key', text: '' };

  const content = [{
    type: 'text',
    text: 'อ่านข้อความทั้งหมดในรูปนี้ — error message, error code, ชื่อโปรแกรม, ปุ่ม, dialog, URL, ข้อความบนหน้าจอ ทุกอย่าง คงคำเดิมตามที่เห็น (ไทย/อังกฤษ) ห้ามแปลห้ามสรุป ตอบเป็นรายการสั้นๆ บรรทัดละข้อ ถ้าเป็นภาพถ่ายอุปกรณ์ที่ไม่มีข้อความเลย ตอบว่า "[ไม่พบข้อความในรูป]"',
  }];
  for (const uri of dataUris) {
    if (typeof uri !== 'string' || !uri.startsWith('data:')) continue;
    content.push({ type: 'image_url', image_url: { url: uri } });
  }
  if (content.length === 1) return { status: 'empty', text: '' };

  const body = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{ role: 'user', content }],
    temperature: 0.0,
    max_tokens: 2048,
  };

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = (await r.text()).slice(0, 200);
      console.warn(`[OCR-fallback] Groq Vision ${r.status}: ${errText}`);
      return { status: 'error', text: '', error: `Groq ${r.status}: ${errText}` };
    }
    const data = await r.json();
    const text = (data?.choices?.[0]?.message?.content || '').trim();
    console.log(`[OCR-fallback] Groq extracted ${text.length} chars`);
    if (!text || text === '[ไม่พบข้อความในรูป]') {
      return { status: 'no-text', text: '' };
    }
    return { status: 'ok', text };
  } catch (err) {
    console.warn('[OCR-fallback] error:', err.message);
    return { status: 'error', text: '', error: err.message };
  }
}

// Try Gemini first → fallback to Groq llama-4-scout vision on 429/error.
async function ocrImagesWithFallback(dataUris) {
  const primary = await ocrImages(dataUris);
  // Definitive success or empty input — no need to retry.
  if (primary.status === 'ok' || primary.status === 'empty') {
    return primary;
  }
  // Gemini said "no-text" OR errored. Both deserve a Groq retry, because
  // Gemini Vision regularly false-negatives on:
  //   - low-contrast BSOD photos
  //   - off-axis screen shots with glare
  //   - small/distant text in dialog boxes
  // If Groq finds text, use it; if Groq also says no-text, we can trust
  // the consensus. Net cost: one extra vision call when OCR was uncertain.
  console.log(`[OCR] primary status=${primary.status}, trying Groq fallback`);
  const fallback = await ocrImagesGroq(dataUris);
  if (fallback.status === 'ok') {
    return { ...fallback, provider: 'groq' };
  }
  // Groq also failed/no-text — return whichever has more signal:
  //   - if primary was no-text and Groq was no-text → definitive no-text
  //   - if primary errored → return primary so user sees original error
  if (primary.status === 'no-text' && fallback.status === 'no-text') {
    return { status: 'no-text', text: '', provider: 'both' };
  }
  return primary;
}

// ---- Knowledge Base search ----
async function searchKnowledge(query) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://rthsmtimvqjnfvgepqpk.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseKey) return [];
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/search_knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ p_query: query, p_limit: 5 }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function formatKnowledgeContext(results) {
  if (!results || results.length === 0) return '';
  const blocks = results.map((r, i) =>
    `[${i+1}] แหล่ง: ${r.source === 'ticket_reply' ? 'ประสบการณ์ทีม IT' : 'คู่มือ'} — ${r.title || ''}\n${r.content}`
  ).join('\n\n---\n\n');
  return `\n\n[ข้อมูลจากฐานความรู้]\n${blocks}`;
}

// ---- Call Groq API ----
const MAX_HISTORY = 10; // keep last N messages to avoid token overflow
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-1.5-flash-latest';
// Groq fallback model (small + fast — different rate-limit pool than scout)
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';

function trimHistory(messages) {
  return messages.length > MAX_HISTORY ? messages.slice(-MAX_HISTORY) : messages;
}

// Single Groq call — no internal retry (the orchestrator decides when to
// retry vs. fall over to a different provider).
async function callGroqOnce(apiKey, model, messages, systemPrompt) {
  const body = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...trimHistory(messages)],
    temperature: 0.7,
    max_tokens: 1024,
  };
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (r.ok) {
    const data = await r.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }
  const errText = await r.text();
  const err = new Error(`Groq ${model} ${r.status}: ${errText.slice(0, 200)}`);
  err.status = r.status;
  throw err;
}

// Single Gemini call — Google's REST API has a different shape than OpenAI.
// Roles: 'user' / 'model' (no 'assistant' or 'system' role — system goes
// in systemInstruction). Returns plain text.
async function callGeminiOnce(apiKey, messages, systemPrompt) {
  const trimmed = trimHistory(messages);
  const contents = trimmed.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  };
  const url = `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) {
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return text.trim();
  }
  const errText = await r.text();
  const err = new Error(`Gemini ${r.status}: ${errText.slice(0, 200)}`);
  err.status = r.status;
  throw err;
}

// Cerebras — OpenAI-compatible API, free tier ~30K TPM (separate quota
// from Groq, so they stack). Their inference is the fastest in market
// (~2000 tok/s on Llama 3.3 70B).
const CEREBRAS_URL   = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama-3.3-70b';

async function callCerebrasOnce(apiKey, messages, systemPrompt) {
  const body = {
    model: CEREBRAS_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...trimHistory(messages)],
    temperature: 0.7,
    max_tokens: 1024,
  };
  const r = await fetch(CEREBRAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (r.ok) {
    const data = await r.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }
  const errText = await r.text();
  const err = new Error(`Cerebras ${r.status}: ${errText.slice(0, 200)}`);
  err.status = r.status;
  throw err;
}

// Fallback chain: Groq scout → Cerebras → Gemini Flash → Groq 8b.
// Each provider's quota is independent, so the chain stacks ~90K TPM
// of free headroom. Skip a provider's retries on 429/5xx — go straight
// to the next provider so the user doesn't wait.
async function callLLM(messages, systemPrompt = SYSTEM_PROMPT) {
  const groqKey     = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const geminiKey   = process.env.GEMINI_API_KEY;

  const providers = [];
  if (groqKey)     providers.push({ name: 'groq-scout',
    fn: () => callGroqOnce(groqKey, MODEL, messages, systemPrompt) });
  if (cerebrasKey) providers.push({ name: 'cerebras-llama-3.3-70b',
    fn: () => callCerebrasOnce(cerebrasKey, messages, systemPrompt) });
  if (geminiKey)   providers.push({ name: 'gemini-flash',
    fn: () => callGeminiOnce(geminiKey, messages, systemPrompt) });
  if (groqKey)     providers.push({ name: 'groq-8b',
    fn: () => callGroqOnce(groqKey, GROQ_FALLBACK_MODEL, messages, systemPrompt) });

  if (providers.length === 0) throw new Error('No LLM provider configured (set GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY)');

  const failures = [];
  for (const p of providers) {
    try {
      return await p.fn();
    } catch (err) {
      const status = err.status || '???';
      const msg = (err.message || 'unknown').slice(0, 120);
      failures.push(`${p.name}=${status}`);
      console.warn(`[LLM] ${p.name} failed (${status}): ${err.message}`);
    }
  }
  // Surface ALL failures so the frontend debug bubble shows whether the
  // chain actually fell over to each provider or short-circuited early.
  throw new Error(`all providers failed [${failures.join(', ')}] — last: ${failures[failures.length - 1] || 'none'}`);
}

// Backwards-compat wrapper — older code paths still call callGroq().
async function callGroq(_apiKey, messages, systemPrompt = SYSTEM_PROMPT) {
  return callLLM(messages, systemPrompt);
}

// ---- Draft prompt ----
function buildDraftPrompt(history, worklist) {
  const conv = history.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n');

  let worklistText = '';
  if (worklist && Array.isArray(worklist) && worklist.length > 0) {
    const lines = worklist.slice(0, 50).map(r =>
      `- jobType="${r.jobType}" | issueType="${r.issueType}" | symptoms=[${r.symptom || ''}]`
    );
    worklistText = `\n\nรายการประเภทงานที่รองรับ (เลือกจากนี้เท่านั้น):\n${lines.join('\n')}`;
  }

  return `จากบทสนทนาด้านล่าง วิเคราะห์และสรุปเป็น JSON สำหรับเปิด ticket IT
ตอบเฉพาะ JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown code fence

กฎสำคัญ:
1. ถ้าในบทสนทนามี "ปัญหาล่าสุด" ที่ user ต้องการให้ IT ดำเนินการ ให้เลือก**เรื่องล่าสุด**เป็นหลัก
2. ถ้า user ถามหลายเรื่อง ให้เลือก**เรื่องที่ user บอกว่าทำไม่ได้หรือขอส่งให้ IT** เท่านั้น
3. request ควรเป็นเรื่องเดียว ไม่รวมหลายปัญหา
4. jobType, issueType, symptom ต้องมาจากรายการที่ให้เท่านั้น (เป๊ะ ๆ ตามตัวอักษร — ห้ามแต่ง ห้ามตัดวงเล็บ)
   - **symptom: ใส่เฉพาะตอน user เลือกชัดเจน (พูดคำนั้น หรือเลือกตัวเลขจากลิสต์ที่ bot ถาม)**
   - **ถ้า user ยังไม่ได้เลือก symptom และ issueType มี symptom > 1 ตัวให้เลือก → ใส่ symptom: "" (ว่าง) ให้ user เลือกในฟอร์ม**
   - ห้ามใส่ symptom แรกของลิสต์เป็น default ห้ามเดา ห้ามแต่งคำใหม่
5. ⚠️ **อ่าน worklist แล้ววิเคราะห์ "เจตนา" — ห้ามแมพแบบ keyword:**
   - แต่ละ jobType มีความหมาย:
     • **คอมพิวเตอร์** = เครื่อง PC/Notebook/Mac/iMac เสีย (เปิดไม่ติด/หน้าจอดับ/ค้าง/blue screen) — ของพัง
     • **อุปกรณ์ไอที** = อุปกรณ์ต่อพ่วงเสีย (เมาส์/คีย์บอร์ด/จอคอมพิวเตอร์/สายชาร์จ/ทีวี/โปรเจคเตอร์)
     • **ปริ้นเตอร์** = ปริ้นเตอร์เสีย/ไม่ออก/หมึกหมด
     • **ปัญหาโปรแกรม** = โปรแกรมที่ใช้อยู่มีปัญหา (Outlook/SAP/Express เปิดไม่ได้, error)
     • **ปัญหาเครือข่าย และอินเทอร์เน็ต** = เน็ต/wifi/ไฟล์กลางเข้าไม่ได้
     • **ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)** = user ขอ permission/access/ติดตั้ง/พนักงานใหม่ (ของไม่พัง — แค่ขอ)
   - **กฎหัวใจ:** "ขอ X" → ขอสิทธิ์, "X เสีย/ดับ/ค้าง/ไม่ออก/ไม่ติด" → ของพัง (เลือก jobType ตามอุปกรณ์)
   - **ตัวอย่างที่หลุดบ่อย:**
     • "หน้าจอคอมดับ" → ❌ ไม่ใช่ "ขอสิทธิ์เข้าระบบ" → ✅ **คอมพิวเตอร์ / PC** (หรือ Notebook ถ้า user บอกว่าเป็น notebook) — เครื่องเสีย
     • "คอมพัง" / "เปิดไม่ติด" / "blue screen" → **คอมพิวเตอร์ / PC**
     • "จอฟ้า / จอฟ้าระหว่างทำงาน / BSOD" → ❌ ไม่ใช่ "ขอสิทธิ์" → ✅ **คอมพิวเตอร์ / PC + symptom: หน้าจอฟ้า** (อาการ blue screen ของ Windows คือเครื่องเสีย)
     • "เมาส์ไม่ติด" → **อุปกรณ์ไอที / เมาส์**
     • "จอดับ" (จอแยก ไม่ใช่ของ notebook) → **อุปกรณ์ไอที / จอคอมพิวเตอร์**
     • "ขอสิทธิ์ปริ้น" → **ขอสิทธิ์เข้าระบบ / เปลี่ยนแปลงสิทธิ์ (ปริ้นเตอร์)** (user แค่ขอ)
     • "ปริ้นไม่ออก" → **ปริ้นเตอร์ / Printer แผนก** (ของเสีย)
     • "ขอลง Photoshop" → **ขอสิทธิ์เข้าระบบ / ขอใช้งานโปรแกรมอื่นๆ** (user ขอติดตั้ง)
     • "ขอเข้า SAP" → **ขอสิทธิ์เข้าระบบ / ขอสิทธิ์เข้าระบบ SAP**
     • "SAP ค้าง" → **ปัญหาโปรแกรม / SAP** (โปรแกรมเสีย)
6. location ต้องเป็น 1 ใน: "Comets HQ", "Comets FAC", "ICT", "JA" (ว่างถ้าไม่ระบุ)
7. locationDetail = โซน/จุดที่พบปัญหา (เช่น "ชั้น 2 ห้อง IT", "โต๊ะทำงาน") หรือ "" ถ้าไม่ระบุ
8. priority ประเมินจากอาการ:
   - "urgent" = งานหยุด / CEO / ปิดงบ
   - "high" = ต้องใช้วันนี้ / ใช้งานต่อไม่ได้
   - "medium" = รบกวนแต่มีทางแก้ชั่วคราว (default)
   - "low" = ขอสิทธิ์ / ติดตั้งโปรแกรม / ไม่เร่ง
9. vncNumber = เฉพาะเลข VNC ที่ user พิมพ์เอง (ห้ามใส่ IP ปลอม ห้ามเดา — ว่างถ้าไม่มี)

{
  "request": "สรุปปัญหา 1-2 ประโยค",
  "jobType": "ค่าจากรายการ",
  "issueType": "ค่าจากรายการ",
  "symptom": "ค่าจากรายการ",
  "location": "Comets HQ | Comets FAC | ICT | JA | \"\"",
  "locationDetail": "โซน/จุด หรือ \"\"",
  "priority": "urgent | high | medium | low",
  "vncNumber": "",
  "hasMultipleIssues": false
}

ถ้าในบทสนทนามีหลายเรื่องจริง ๆ ให้ตั้ง hasMultipleIssues=true และระบุเฉพาะเรื่องล่าสุดใน request${worklistText}

บทสนทนา:
${conv}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require at least one provider configured. The chain (callLLM) walks
  // Groq → Cerebras → Gemini → Groq-8b and uses whichever keys are set.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !process.env.CEREBRAS_API_KEY && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Missing GROQ_API_KEY / CEREBRAS_API_KEY / GEMINI_API_KEY' });
  }

  try {
    const { messages = [], action = 'chat', worklist = null, images = [] } = req.body || {};

    // Sanitize user messages
    const safeMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitize(m.content || ''),
    }));

    // OCR — if the user attached screenshots, pull text out of them with
    // Gemini Vision and append to the last user message so the chat LLM
    // sees the actual error code/message instead of guessing from "[user
    // attached N images]". Always inject a marker (even on failure) so
    // the AI knows OCR was attempted and can act accordingly.
    let ocrResult = { status: 'empty', text: '' };
    if (Array.isArray(images) && images.length > 0 && safeMessages.length > 0) {
      ocrResult = await ocrImagesWithFallback(images);
      let marker = '';
      if (ocrResult.status === 'ok') {
        marker = `\n\n[ข้อความที่ AI อ่านได้จากรูปที่แนบ ${images.length} รูป]:\n${ocrResult.text}`;
      } else if (ocrResult.status === 'no-text') {
        marker = `\n\n[ไม่พบข้อความในรูป — น่าจะเป็นรูปถ่ายจอ/เครื่อง (BSOD, จอดับ, error dialog) — ถาม device ก่อน (PC/Notebook/Macbook/iMac) แล้วค่อยถาม symptom]`;
      } else if (ocrResult.status === 'no-key') {
        marker = `\n\n[ระบบ OCR ปิดอยู่ — น่าจะเป็นรูปถ่ายจอ — ถาม device ก่อน (PC/Notebook/Macbook/iMac) แล้วถาม user ให้พิมพ์ error code/อาการที่เห็น]`;
      } else if (ocrResult.status === 'error') {
        marker = `\n\n[OCR error: ${ocrResult.error || 'unknown'} — ขอให้ user พิมพ์ error code/message ลงมาให้]`;
      }
      if (marker) {
        for (let i = safeMessages.length - 1; i >= 0; i--) {
          if (safeMessages[i].role === 'user') {
            safeMessages[i] = {
              ...safeMessages[i],
              content: safeMessages[i].content + marker,
            };
            break;
          }
        }
      }
    }

    if (action === 'draft') {
      const promptText = buildDraftPrompt(
        messages.map(m => ({ role: m.role, content: sanitize(m.content || '') })),
        worklist
      );
      const text = await callGroq(apiKey, [{ role: 'user', content: promptText }], 'You are a helpful assistant. Output ONLY valid JSON.');
      let json = null;
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) json = JSON.parse(match[0]);
      } catch (_) {}
      return res.status(200).json({ draft: json || { request: text } });
    }

    // Chat with RAG
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    let knowledgeContext = '';
    if (lastUserMsg) {
      const kbResults = await searchKnowledge(sanitize(lastUserMsg.content || ''));
      knowledgeContext = formatKnowledgeContext(kbResults);
    }

    if (knowledgeContext && safeMessages.length > 0) {
      const lastIdx = safeMessages.length - 1;
      safeMessages[lastIdx] = {
        ...safeMessages[lastIdx],
        content: safeMessages[lastIdx].content + knowledgeContext,
      };
    }

    // Build the system prompt conditionally — keeps each request small
    // enough to dodge Groq's per-minute token cap (was hitting 6K-30K TPM
    // and falling all the way through the cascade after ~3-4 turns).
    let systemPrompt = CORE_PROMPT;

    // OCR section (~400 tokens) — only attach when the user actually
    // attached images. Most turns are text-only so this saves a chunk.
    if (Array.isArray(images) && images.length > 0) {
      systemPrompt += OCR_PROMPT;
    }

    // Worklist (~2-5K tokens) — only needed while the AI is still
    // matching the user's words to an issueType. After ~4 user turns the
    // symptom is almost always locked and the conversation is just
    // collecting location / floor / department / priority — none of which
    // need the worklist. Drop it to save the bulk of the per-request
    // tokens.
    //
    // Threshold = 4 (not 3) to cover the "ask device first" 2-step flow:
    //   t1 user: "หน้าจอดับ"
    //   t2 user: "PC"             ← still need worklist to list PC's symptoms
    //   t3 user: "หน้าจอฟ้า"      ← still need worklist to confirm
    //   t4 user: "Comets HQ"      ← safe to drop, location onwards
    const userTurns = safeMessages.filter(m => m.role === 'user').length;
    const symptomLikelyLocked = userTurns >= 4;
    if (!symptomLikelyLocked && Array.isArray(worklist) && worklist.length > 0) {
      const byJob = {};
      for (const r of worklist) {
        if (!r || !r.jobType || !r.issueType) continue;
        if (!byJob[r.jobType]) byJob[r.jobType] = [];
        const syms = String(r.symptom || '')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean)
          .join(', ');
        byJob[r.jobType].push(`  ${r.issueType}: ${syms}`);
      }
      const blocks = Object.entries(byJob).map(([jt, lines]) =>
        `[${jt}]\n${lines.join('\n')}`
      );
      systemPrompt += '\n\n=== รายการอาการที่รองรับ (worklist — เลือกได้เฉพาะรายการนี้) ===\n' + blocks.join('\n');
    }

    const reply = await callGroq(apiKey, safeMessages, systemPrompt);
    const wantsTicket = reply.includes('[CREATE_TICKET]');
    const cleanReply = reply.replace(/\[CREATE_TICKET\]/g, '').trim();

    // Save conversation to chat_logs (fire & forget)
    const supabaseUrl2 = process.env.SUPABASE_URL || 'https://rthsmtimvqjnfvgepqpk.supabase.co';
    const supabaseKey2 = process.env.SUPABASE_ANON_KEY;
    if (supabaseKey2 && req.body.sessionId && req.body.employeeId) {
      const saveMsg = async (role, content) => {
        try {
          await fetch(`${supabaseUrl2}/rest/v1/rpc/save_chat_message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey2, 'Authorization': `Bearer ${supabaseKey2}` },
            body: JSON.stringify({ p_session_id: req.body.sessionId, p_employee_id: req.body.employeeId, p_role: role, p_content: content }),
          });
        } catch (_) {}
      };
      // Save user's last message + bot reply
      if (lastUserMsg) saveMsg('user', sanitize(lastUserMsg.content || ''));
      saveMsg('assistant', cleanReply);
    }

    return res.status(200).json({
      reply: cleanReply,
      wantsTicket,
      ocr: ocrResult.status === 'empty' ? null : {
        status: ocrResult.status,
        text: ocrResult.text || '',
        error: ocrResult.error || null,
        provider: ocrResult.provider || 'gemini',
      },
    });
  } catch (err) {
    console.error('chat error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// Default Vercel timeout is 10s — too tight for the 4-provider fallback
// chain (Groq scout → Cerebras → Gemini → Groq-8b). When the first provider
// is slow under rate-limit pressure, the function timed out before reaching
// the next provider and the user saw "เอ๊ะ AI ติดขัด" on the frontend.
export const config = { maxDuration: 30 };
