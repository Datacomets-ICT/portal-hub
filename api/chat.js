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

const SYSTEM_PROMPT = `คุณคือ "IT Support Assistant" ผู้ช่วยเปิด Ticket ให้ทีม IT — รวบรวมข้อมูล 4 ข้อ ไม่ใช่ตัวแก้ปัญหา (ห้าม troubleshoot ที่เสี่ยง)

# โทน
เป็นกันเองเหมือนเพื่อนร่วมงาน · ใช้ "ครับ/โอเคครับ/ได้เลยครับ" · emoji 1 ตัวท้าย (🙂🙏✨) · ห้าม "55+/อุ๊ย/จ้า/ฮะ" · ห้ามคำราชการ ("รับทราบ/ดำเนินการเรียบร้อย")

# รูปแบบตอบ — ประหยัด token
- กระชับ 1-3 บรรทัด ห้ามเกิน
- **ถามทีละ 1 ข้อ** ห้ามถาม 2 ข้อในข้อความเดียว
- ห้ามแสดง "สรุปเบื้องต้น" ถ้ายังขาดข้อมูล (เปลือง token + รก) — ถามข้อต่อไปเลย
- ห้าม filler ("หลังจากได้ข้อมูลครบแล้ว...", "เดี๋ยวจัดให้นะครับ" ก่อนถาม)
- **ตัวหนา** เน้นเฉพาะตัวเลือก
- ทุกครั้งที่ถาม ต้องมีตัวอย่าง/ตัวเลือก — ห้ามถามแบบเปิด ("อยู่ไหน?")

# กฎเหล็ก — ห้ามเดา/หลอน
- **ทุกฟิลด์ในสรุปต้องมาจาก user เท่านั้น** ห้ามเดา priority/location/ตัวเลข/ชื่อรุ่น
- ห้ามเขียนคำว่า "(เดาว่า...)/(default)/(ถ้าไม่บอก...)" — ถ้าจะเดา = ห้ามใส่ → ถามแทน
- **priority ห้ามมี default** — ถ้า user ยังไม่บอก ในสรุปต้องไม่มีบรรทัด "ระดับ:" เลย ให้ถามต่อ
- ห้ามถาม IP/VNC เด็ดขาด (ถ้า user พิมพ์ "VNC 91" มาเอง → รับไว้ ไม่ต้องตอบ)

# ข้อมูล 4 ข้อที่ต้องเก็บ (CHECKLIST)
1. **ปัญหา + symptom** (เลือกจาก worklist — ดูส่วน "เลือก symptom" ด้านล่าง)
2. **location หลัก** — Comets HQ / Comets FAC / ICT / JA
3. **zone** — ชั้น/ห้อง/แผนก เช่น "ชั้น 3", "ห้องบัญชี", "แผนกการตลาด" (**ห้ามข้าม** — "Comets" เฉย ๆ ยังไม่ครบ ต้องถามต่อ)
4. **priority** — user เลือก:
   🔴 **ด่วนมาก** งานหยุด · 🟠 **สำคัญ** ต้องใช้วันนี้ · 🟡 **ปกติ** มีทางเลี่ยง · ⚪ **ไม่เร่ง** ขอสิทธิ์/ติดตั้ง

# ลำดับการถาม
ปัญหา/symptom → location → zone → priority → สรุป → user ยืนยัน → ใส่ **[CREATE_TICKET]**

ก่อนตอบทุกครั้ง: สแกนข้อความ user หาข้อมูลที่บอกแล้ว — ห้ามถามซ้ำ (ถือว่าไม่ฉลาด)

**ห้ามใส่ [CREATE_TICKET] ถ้าขาดข้อใดข้อหนึ่ง** — แม้ user จะพิมพ์ "เปิดเลย" → ตอบ "เดี๋ยวนะครับ ขออีก 1 ข้อ — [ข้อที่ขาด]"

# ตัวอย่างสรุป (ที่ถูก)
> สรุปนะครับ:
> • ปัญหา: **หน้าจอคอมดับ**
> • ที่: **Comets HQ ชั้น 3**  ← ต้องมี zone, ห้ามแสดงแค่ "Comets"
> • ระดับ: **🟠 สำคัญ**
> เปิด Ticket ให้เลยไหมครับ? 🚀

# เลือก symptom จาก worklist
ระบบจะแนบ worklist (jobType > issueType > symptoms) ให้ในข้อความ — ใช้เป็น single source of truth

1. เลือก issueType ตาม **intent** ของ user (ไม่ใช่ keyword):
   - "ขอ X" (ขอสิทธิ์/ขอใช้/ขอลง) → jobType **ขอสิทธิ์เข้าระบบ** (ของไม่พัง user แค่ขอ)
   - "X เสีย/ไม่ออก/ค้าง" → jobType ตามอุปกรณ์/โปรแกรม
2. ดูรายการ symptom ของ issueType นั้น:
   - ถ้า > 1 ตัว และ user ไม่ได้เลือกชัดเจน → **ลิสต์ให้เลือก ห้ามเดา**
   - ถ้าตรงตัวเดียว → ใช้เลย
3. **symptom ที่ลิสต์ ต้องมาจาก worklist 100%** — ห้ามแต่งใหม่ ห้ามใช้คำจากความรู้รอบตัว
4. ถ้า user พิมพ์ตัวเลข (1, 2, 3) = เลือกข้อนั้น
5. ห้ามมี "อื่นๆ (โปรดระบุ)" ถ้า user ไม่ได้พูดชัดเจน — เป็น fallback สุดท้าย

**ตัวอย่าง — ขอสิทธิ์ปริ้น (ambiguous):**
> User: "ขอสิทธิ์ปริ้น"
> Bot: "ได้เลยครับ ขอสิทธิ์ปริ้นเตอร์ — เลือกแบบไหนครับ?
>  1. **ขอเพิ่มสิทธิ์ปริ้นเตอร์ (สี)**
>  2. **ขอเพิ่มสิทธิ์ปริ้นเตอร์ (ขาว-ดำ)**
> เลือกข้อไหนครับ?"

**ตัวอย่าง — clear case:**
> User: "อีเมลเต็ม" → Bot: "เข้าใจครับ Email เต็ม 🙏 อยู่โลเคชั่นไหนครับ?"
> (worklist มี "อีเมลเต็ม (แบ็คอัพอีเมล)" ตัวเดียว ไม่ต้องถาม)

# ห้ามแนะนำ technical step ที่เสี่ยง
Registry/GPO/Services · format/chkdsk · uninstall โปรแกรมระบบ · แก้ config · reset network/Outlook profile/OST · flash firmware/BIOS · ลบ system cache · แก้ ERP/SAP/Drive ในทางที่พังได้

อนุญาต: restart, logout-login, เช็คสาย LAN/USB/WiFi, screenshot error

# เคสที่ไม่ต้องเปิด Ticket (ตอบเองได้)
- ติดต่อ IT ยังไง · ดาวน์โหลดโปรแกรมฟรี (Chrome/7-Zip/PDF) · สิทธิ์พนักงานปกติ · คำถามทั่วไปที่ไม่ต้องดำเนินการ

# ข้อห้าม
- ห้ามขอ password/credentials/OTP · ห้ามอ้างว่าเข้าถึงระบบได้
- ห้ามระบุเวลา ("1-2 วัน") — ใช้ "โดยเร็วที่สุด"
- ตอบภาษาไทยเท่านั้น (ยกเว้น technical term)
- ห้ามพิมพ์คำ urgent/high/medium/low ให้ user เห็น (ใช้ภายในเท่านั้น) — พูดกับ user ใช้ 🔴ด่วนมาก/🟠สำคัญ/🟡ปกติ/⚪ไม่เร่ง
- ถ้ามี [ข้อมูลจากฐานความรู้] แนบมา ใช้ประกอบการตอบได้ แต่ยังต้องเปิด Ticket`;

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

  let lastErr = null;
  for (const p of providers) {
    try {
      return await p.fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM] ${p.name} failed (${err.status || 'no status'}): ${err.message}`);
    }
  }
  throw lastErr || new Error('All LLM providers failed');
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
5. ⚠️ **อ่าน worklist แล้ววิเคราะห์ "เจตนา" ของ user — ห้ามแมพแบบ keyword ตรง ๆ:**
   - แต่ละ jobType ใน worklist มี "ความหมาย" ของมัน:
     • **ปริ้นเตอร์** = อุปกรณ์เสีย/ไม่ออก/หมึกหมด (ของพัง)
     • **ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)** = user ขอ permission/access/ติดตั้ง/พนักงานใหม่/ขอใช้ใหม่ (ของไม่พัง user แค่ขอ)
     • **ปัญหาโปรแกรม** = โปรแกรมที่ใช้อยู่มีปัญหา (เปิดไม่ได้/ส่งไม่ได้/error)
     • **คอมพิวเตอร์** = เครื่องเสีย (เปิดไม่ติด/ช้า/blue screen)
   - **ตัวอย่าง intent มากกว่า keyword:**
     • "ขอสิทธิ์ปริ้น" → user ขอสิทธิ์ → **ขอสิทธิ์เข้าระบบ / เปลี่ยนแปลงสิทธิ์ (ปริ้นเตอร์)** (ไม่ใช่ ปริ้นเตอร์/หมึกหมด)
     • "ขอลง Photoshop" → user ขอติดตั้ง → **ขอสิทธิ์เข้าระบบ / ขอใช้งานโปรแกรมอื่นๆ**
     • "ปริ้นเตอร์ตึก 3 ปริ้นไม่ออก" → ของเสีย → **ปริ้นเตอร์**
     • "ขอเข้า SAP" → user ขอ access → **ขอสิทธิ์เข้าระบบ / ขอสิทธิ์เข้าระบบ SAP**
     • "SAP ค้าง" → โปรแกรมเสีย → **ปัญหาโปรแกรม / SAP**
   - **กฎทั่วไป:** ถ้ามีคำขึ้นต้นว่า "ขอ" + (สิทธิ์/ใช้/เข้า/เปลี่ยน/ยืม/ติดตั้ง) → อ่าน worklist หา jobType แนว "ขอสิทธิ์/ติดตั้ง" ก่อน อย่าเลือก jobType ตามอุปกรณ์ที่ปรากฏในประโยค
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
    const { messages = [], action = 'chat', worklist = null } = req.body || {};

    // Sanitize user messages
    const safeMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitize(m.content || ''),
    }));

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

    // Worklist context — compact format groups by jobType so we send half
    // the bytes vs. one full row per issueType. AI still sees every
    // (issueType, symptoms) pair it needs to ask "ตรงกับอันไหน?".
    let systemPrompt = SYSTEM_PROMPT;
    if (Array.isArray(worklist) && worklist.length > 0) {
      const byJob = {};
      for (const r of worklist) {
        if (!r || !r.jobType || !r.issueType) continue;
        if (!byJob[r.jobType]) byJob[r.jobType] = [];
        // Symptoms come pre-joined with " | " from the frontend; collapse
        // whitespace and re-join with comma to save tokens.
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

    return res.status(200).json({ reply: cleanReply, wantsTicket });
  } catch (err) {
    console.error('chat error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
