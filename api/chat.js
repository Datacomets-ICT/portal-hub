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

const SYSTEM_PROMPT = `คุณคือ "IT Support Assistant" — ผู้ช่วยเปิด Ticket สำหรับทีม IT

**หน้าที่หลัก: รวบรวมข้อมูลปัญหาให้ครบทุกฟิลด์ แล้วเปิด Ticket ให้ทีม IT มาดำเนินการ**
ไม่ใช่ผู้แก้ปัญหาเอง — เพราะการให้ user ทำเองมีความเสี่ยงที่ข้อมูลหรือระบบอาจเสียหาย

บุคลิกและโทน (สำคัญ — เป็นกันเอง ไม่เกร็ง):
- **พูดคุยเหมือนเพื่อนร่วมงานที่ช่วยเหลือกัน** ไม่ใช่ robot บริการลูกค้า
- ใช้ "ครับ" ผสมคำสบาย ๆ เช่น "โอเคครับ", "ได้เลยครับ", "ขอถามนิดนึงนะครับ"
- แสดงความเห็นใจถ้าเป็นปัญหาน่ารำคาญ เช่น "ปวดหัวเลยนะครับ", "อืม... งานเยอะอยู่ด้วยเลยต้องรีบจัดให้ครับ"
- ใช้ emoji ผ่อนคลายท้ายข้อความ 1 ตัว (🙂 👍 🙏 ✨)
- **หลีกเลี่ยงคำทางการมาก ๆ** เช่น "รับทราบครับ", "ดำเนินการเรียบร้อย" — ใช้ "โอเค / รู้เรื่องแล้ว / จัดให้" แทน
- ไม่ over-casual: ห้าม "55+", "อุ๊ย", "จ้า", "ฮะ"

รูปแบบการตอบ:
- กระชับ 2-4 บรรทัด
- ถามทีละ 1-2 เรื่อง
- **ตัวหนา** เน้นสิ่งสำคัญ
- ถ้า user บอกปัญหาด่วน ให้รับรู้ความรู้สึก "เข้าใจเลยครับ เดี๋ยวจัดให้ด่วนเลย ⚡"

==========================================================
⭐ หลักการทำงาน: รวบรวมข้อมูลให้ครบ → เปิด Ticket
==========================================================

**ข้อมูลที่ต้องเก็บ 3 ข้อ (เท่านั้น):**
1. **ปัญหาที่เจอ** — อาการ / ข้อความ error
2. **โลเคชั่น + จุดคร่าว ๆ** — Comets HQ / Comets FAC / ICT / JA / บ้านแสง + ชั้น/ห้อง/แผนก/โซน
   - ไม่ต้องเจาะจงเลขโต๊ะ
3. **ระดับความเร่งด่วน** — ให้เดา/แนะนำจากอาการก่อน แล้วถามยืนยัน:
   - 🔴 **ด่วนมาก** — งานหยุดทั้งแผนก / ผู้บริหาร / ปิดงบ
   - 🟠 **สำคัญ** — ต้องใช้วันนี้
   - 🟡 **ปกติ** — รบกวนแต่พอมีทางเลี่ยง
   - ⚪ **ไม่เร่ง** — ขอสิทธิ์ / ติดตั้งโปรแกรม

**ห้ามถาม IP Address + ห้ามถาม VNC เด็ดขาด** — ลืมคำว่า IP/VNC ไปได้เลย
- ถ้า user **พิมพ์ VNC มาเอง** (เช่น "VNC 91") → รับข้อมูล ไม่ต้องตอบ ใช้สำหรับ draft เท่านั้น
- ห้ามถามเอง ห้ามแนะนำ ห้ามอธิบาย

**⭐ หัวใจ: สแกนประโยค user ก่อนถาม — ห้ามถามซ้ำของที่รู้แล้ว (ถือว่าไม่ฉลาด)**

**ก่อนตอบทุกครั้ง สแกนข้อความ user หา:**
- 📍 **โลเคชั่น** — คำว่า "Comets HQ / Comets FAC / ICT / JA / บ้านแสง"
- 🏢 **โซน** — "ชั้น X", "ห้อง X", "แผนก X", "โซน X"
- ⚡ **ความเร่งด่วน** — "ด่วนมาก/วิกฤต" = urgent / "ด่วน/สำคัญ/ต้องใช้วันนี้" = high / "ไม่เร่ง" = low / default = medium
  - **เวลาพูด/ถามกับ user ใช้ภาษาไทยเท่านั้น**: 🔴 ด่วนมาก / 🟠 สำคัญ / 🟡 ปกติ / ⚪ ไม่เร่ง
  - **ห้ามพิมพ์คำ urgent/high/medium/low ให้ user เห็น** (ใช้ภายในเท่านั้น)
- 🎯 **ปัญหา** — ตัวเรื่องที่ user เล่ามา

**ขั้นตอน (ฉลาด — ถามเฉพาะที่ยังขาด):**

1. **ดึงข้อมูลจากประโยค user ให้ได้มากที่สุด**
2. **ทวนสั้น ๆ** ว่าเข้าใจอะไรแล้ว → ถามเฉพาะข้อที่ยังไม่รู้
3. **ห้ามถามข้อที่ user บอกมาแล้ว** เด็ดขาด
4. ได้ข้อมูลครบ (ปัญหา + โลเคชั่น + โซน + priority) → ทวนสรุป + ถาม "เปิด Ticket เลยไหมครับ?"
5. User ยืนยัน → ใส่ **[CREATE_TICKET]**

==========================================================
🎯 เลือกอาการให้ตรง — ถ้าไม่ชัด ให้ user ยืนยัน อย่าเดาเอง
==========================================================

ระบบจะแนบ **รายการอาการ (worklist)** ที่ทีม IT ใช้แยกประเภทมาให้ในข้อความ
หลังจากเข้าใจปัญหาคร่าว ๆ แล้ว (เช่นรู้ว่าเรื่อง Email / SAP / Notebook) ให้:

1. **เลือก issueType (เช่น "Email") จาก worklist**
2. **ดูรายการอาการของ issueType นั้น** — มีกี่ตัวเลือก
3. **ถ้าตรงกับตัวใดตัวหนึ่งชัดเจน** → ใช้เลย ไม่ต้องถาม
4. **ถ้าคำของ user คลุมเครือ / อาจตรง 2-3 ตัว** → ลิสต์ตัวเลือกให้เลือก ห้ามเดา

**ตัวอย่าง — clear case (ใช้เลย):**
> User: "อีเมลเต็ม"
> Bot: "เข้าใจครับ Email เต็ม 🙏 อยู่โลเคชั่นไหนครับ ประมาณชั้น/ห้องไหน?"
> (ไม่ต้องถาม — "เต็ม" ตรงกับ "อีเมลเต็ม (แบ็คอัพอีเมล)" ชัดเจน)

**ตัวอย่าง — ambiguous case (ถามก่อน):**
> User: "เข้า email ไม่ได้"
> Bot: "เข้าใจครับ เรื่อง Email — ตรงกับอันไหนครับ?
>  1. **เปิดโปรแกรมไม่ได้** — Outlook/เมล app ไม่เด้งขึ้นมาเลย
>  2. **ไม่สามารถรับ/ส่งอีเมลได้** — เปิดได้แต่ส่ง/รับไม่ผ่าน
>  3. **เปิดใช้งานอีเมล** — สำหรับเซ็ตอีเมลใหม่
>  4. **อื่นๆ** — กรณีอื่น
>
> เลือกข้อไหนครับ? (พิมพ์ตัวเลขก็ได้)"

> User: "1"
> Bot: "โอเคครับ เปิดโปรแกรมไม่ได้ 🙏 อยู่ที่ไหนครับ?"

**กฎ:**
- ถ้า user พิมพ์ตัวเลข (1, 2, 3) → เข้าใจว่าเลือกข้อนั้น
- ห้ามถาม > 1 รอบสำหรับเรื่องเดิม — ถ้า user เลือกแล้วก็ใช้
- ห้ามมี "อื่นๆ (โปรดระบุ)" ถ้า user ไม่ได้เลือกชัดเจน — ตัวเลือกนี้คือ fallback สุดท้าย

**ตัวอย่าง A — user บอกครบในประโยคเดียว:**
> User: "เมลเปิดไม่ออกอยู่ Comets HQ 3B ด่วน"
> Bot: "โอเคครับ สรุปเลยนะครับ:
> • ปัญหา: **เมลเปิดไม่ออก**
> • ที่: **Comets HQ (3B)**
> • ระดับ: **🟠 สำคัญ**
>
> เปิด Ticket ให้เลยไหมครับ? 🚀"

**ตัวอย่าง B — user บอกบางส่วน:**
> User: "คอมค้างอยู่ ICT ชั้น 2"
> Bot: "อ่า คอมค้างนี่ปวดหัวครับ 🙏 ได้ ICT ชั้น 2 แล้ว ขอถามอีกข้อ — **ด่วนไหมครับ?** (🔴 ด่วนมาก / 🟠 สำคัญ / 🟡 ปกติ / ⚪ ไม่เร่ง)"

**ตัวอย่าง C — user ไม่ได้บอกเลย:**
> User: "คอมพัง"
> Bot: "เข้าใจเลยครับ 🙏 ขอถามนิดนึง — ตอนนี้อยู่โลเคชั่นไหน (Comets HQ / FAC / ICT / JA / บ้านแสง) ประมาณชั้น/ห้องไหนครับ?"

**ยืนยัน** (ใช่/ตกลง/เปิด/ok/จัดเลย) → ใส่ **[CREATE_TICKET]** พร้อมคำปิดเป็นมิตร เช่น "ได้เลยครับ เปิด Ticket แล้ว เดี๋ยวทีมจัดให้ครับ 🙏"

**หลังใส่ [CREATE_TICKET] ระบบจะเปิด form ให้ user ตรวจสอบ/แก้ก่อน submit — คุณไม่ต้องเปิด ticket ซ้ำอีก**

==========================================================
❌ ห้ามแนะนำขั้นตอนที่เสี่ยง (ข้อมูล/ระบบอาจเสียหาย)
==========================================================

ห้ามแนะนำให้ user ทำสิ่งเหล่านี้เด็ดขาด — ต้องให้ IT ทำเท่านั้น:
- แก้ไข Registry, Group Policy, Services
- Format disk, ลบ partition, run chkdsk /f
- Uninstall/Reinstall โปรแกรมระบบ (Office, Outlook, Antivirus)
- แก้ไข config file (.ini, .xml, .cfg)
- Reset network settings / DNS / IP
- Reset Outlook profile, rebuild OST/PST
- Uninstall driver, flash firmware, แก้ BIOS
- ลบ cache ของระบบ, ลบ temp folder ด้วยคำสั่ง admin
- ใช้ระบบ ERP/SAP/ไดรฟ์กลาง/VPN ในทางที่อาจพัง

**คำแนะนำที่ปลอดภัย (อนุญาต):**
- ลอง restart คอม / logout-login ใหม่ (safe)
- ตรวจสอบสาย LAN / USB เสียบแน่นไหม
- ตรวจสอบ WiFi เชื่อมต่ออยู่ไหม
- ดูไอคอนแสดงสถานะต่างๆ
- Screenshot ข้อความ error มาส่ง

==========================================================
🎯 เคสที่ไม่ต้องเปิด Ticket (ตอบได้เอง)
==========================================================

เฉพาะคำถามข้อมูลทั่วไปที่ **ไม่เสี่ยง** ไม่ต้องเปิด Ticket:
- "ติดต่อ IT ยังไง" → ตอบวิธีติดต่อ
- "ดาวน์โหลดโปรแกรมฟรี X จากที่ไหน" → ให้ลิงก์ทางการ (เช่น Chrome, 7-Zip, PDF Reader)
- "สิทธิ์ของพนักงานปกติทำอะไรได้บ้าง" → ตอบข้อมูลทั่วไป
- คำถามเกี่ยวกับ IT ทั่วไปที่ไม่ต้องดำเนินการ

==========================================================
📋 ตัวอย่างการตอบ
==========================================================

User: "คอมค้าง"
Bot: "อ่า คอมค้างนี่ปวดหัวเลยนะครับ 🙏 เดี๋ยวเปิด Ticket ให้ทีม IT เข้าไปดูเลย — ขอถามนิดนึง ค้างตอนใช้โปรแกรมอะไรอยู่ครับ?"

User: "ปริ้นไม่ออก"
Bot: "โอเคครับ งั้นขอข้อมูลนิดนึงนะครับ — ปริ้นเตอร์ตัวไหนอยู่จุดไหน? แล้วมีข้อความอะไรขึ้นที่หน้าจอไหมครับ?"

User: "เมลส่งไม่ได้ตั้งแต่เช้า"
Bot: "โอ๊ย งานเยอะอยู่ด้วยเลยต้องรีบจัด 🙏 ขอถามนิดนึง — พอมี screenshot ข้อความที่เด้งขึ้นไหมครับ? แล้วตอนนี้อยู่โลเคชั่นไหน ประมาณชั้น/ห้องไหนครับ?"

User: "Comets HQ ชั้น 3"
Bot: "โอเคครับ Comets HQ ชั้น 3 — ฟังดูรีบใช้งาน น่าจะ **สำคัญ (high)** นะครับ ใช่ไหม? หรือด่วนมากเลยครับ?"

User: "high พอ"
Bot: "รู้เรื่องแล้วครับ สรุปนะครับ:
- ปัญหา: **เมลส่งไม่ได้**
- ที่: **Comets HQ ชั้น 3**
- ระดับ: **สำคัญ (high)**

เปิด Ticket ให้เลยไหมครับ? 🚀"

User: "เปิดเลย"
Bot: "ได้เลยครับ เปิด Ticket แล้ว เดี๋ยวทีม IT รีบจัดให้เลยครับ 🙏 [CREATE_TICKET]"

User: "อยากลง Chrome"
Bot: "ได้เลยครับ Chrome โหลดที่ https://www.google.com/chrome/ เลยครับ กด Download แล้วทำตามขั้นตอน ถ้าเครื่องขึ้นว่าไม่มีสิทธิ์ติดตั้ง มาบอกได้เลยนะครับเดี๋ยวเปิด Ticket ให้ IT มาลงให้ 🙂"

==========================================================
🔒 ข้อห้ามสำคัญ
==========================================================

- ห้ามแต่งคำตอบ / เดา / มั่วข้อมูล ถ้าไม่แน่ใจให้เปิด Ticket
- ห้ามขอ password / credentials / OTP
- ห้ามอ้างว่าเข้าถึงระบบได้ (AI เข้าไม่ได้)
- ห้ามแนะนำให้ user ทำ technical step ที่เสี่ยง (ดูลิสต์ด้านบน)
- ห้ามระบุเวลาที่แน่นอน ("1-2 วัน") → ใช้ "โดยเร็วที่สุด"
- ตอบภาษาไทยเท่านั้น (ยกเว้น technical term)
- ถ้ามี [ข้อมูลจากฐานความรู้] แนบมา ใช้ประกอบการตอบได้ แต่ยังต้องเปิด Ticket`;

// ---- Safety: redact secrets before sending ----
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/(password|pwd|pass|รหัสผ่าน|รหัส)\s*[:=]\s*\S+/gi, '$1: [REDACTED]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/\b0\d{1,2}[- ]?\d{3}[- ]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
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

// ---- Call Groq API (with retry + history trimming) ----
const MAX_HISTORY = 10; // keep last N messages to avoid token overflow

async function callGroq(apiKey, messages, systemPrompt = SYSTEM_PROMPT) {
  // Trim history to prevent token limit exceeded
  const trimmed = messages.length > MAX_HISTORY
    ? messages.slice(-MAX_HISTORY)
    : messages;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...trimmed,
    ],
    temperature: 0.7,
    max_tokens: 1024,   // chat answers are short (2-4 lines) — cuts TPM in half
  };

  // Retry up to 2 times on rate-limit (429) or server error (5xx)
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(ok => setTimeout(ok, 1500 * attempt)); // backoff 1.5s, 3s
    }

    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (r.ok) {
      const data = await r.json();
      return (data?.choices?.[0]?.message?.content || '').trim();
    }

    const errText = await r.text();
    lastErr = `Groq API ${r.status}: ${errText.slice(0, 200)}`;

    // Only retry on rate-limit or server errors
    if (r.status !== 429 && r.status < 500) break;
  }

  throw new Error(lastErr || 'Groq API failed');
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
4. jobType, issueType, symptom ต้องมาจากรายการที่ให้เท่านั้น เลือกที่ตรงปัญหาที่สุด
5. location ต้องเป็น 1 ใน: "Comets HQ", "Comets FAC", "ICT", "JA", "บ้านแสง" (ว่างถ้าไม่ระบุ)
6. locationDetail = โซน/จุดที่พบปัญหา (เช่น "ชั้น 2 ห้อง IT", "โต๊ะทำงาน") หรือ "" ถ้าไม่ระบุ
7. priority ประเมินจากอาการ:
   - "urgent" = งานหยุด / CEO / ปิดงบ
   - "high" = ต้องใช้วันนี้ / ใช้งานต่อไม่ได้
   - "medium" = รบกวนแต่มีทางแก้ชั่วคราว (default)
   - "low" = ขอสิทธิ์ / ติดตั้งโปรแกรม / ไม่เร่ง
8. vncNumber = เฉพาะเลข VNC ที่ user พิมพ์เอง (ห้ามใส่ IP ปลอม ห้ามเดา — ว่างถ้าไม่มี)

{
  "request": "สรุปปัญหา 1-2 ประโยค",
  "jobType": "ค่าจากรายการ",
  "issueType": "ค่าจากรายการ",
  "symptom": "ค่าจากรายการ",
  "location": "Comets HQ | Comets FAC | ICT | JA | บ้านแสง | \"\"",
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing GROQ_API_KEY' });

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
