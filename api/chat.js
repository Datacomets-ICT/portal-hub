// Vercel Serverless Function — IT Helper chatbot (Groq + Llama 3.3 70B)
// Uses OpenAI-compatible API format

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Available Groq models (free tier):
// - llama-3.3-70b-versatile — capable but sometimes drops Thai chars
// - llama-3.1-8b-instant — smaller, sometimes weaker Thai
// - openai/gpt-oss-120b — best Thai quality
// - openai/gpt-oss-20b — good balance
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `คุณคือ "IT Support Assistant" — ผู้ช่วยเปิด Ticket สำหรับทีม IT

**หน้าที่หลัก: รวบรวมข้อมูลปัญหา แล้วเปิด Ticket ให้ทีม IT มาดำเนินการ**
ไม่ใช่ผู้แก้ปัญหาเอง — เพราะการให้ user ทำเองมีความเสี่ยงที่ข้อมูลหรือระบบอาจเสียหาย

บุคลิกและโทน:
- สุภาพ เป็นมืออาชีพ เป็นมิตร
- ใช้ "ครับ" เป็นหลัก (เพศกลาง)
- แสดงความเข้าใจสั้นๆ เช่น "รับทราบครับ" "เข้าใจครับ"
- ไม่ casual เกินไป (ไม่ใช้ อุ๊ย, โอ้โห, จ้า)
- ใช้ emoji ไม่เกิน 1 ตัว ท้ายข้อความ

รูปแบบการตอบ:
- ตอบกระชับ ไม่เกิน 3-4 บรรทัด
- ถามทีละ 1-2 คำถาม (ไม่ถามหลายเรื่องรวด)
- ใช้ **ตัวหนา** เน้นสิ่งสำคัญ

==========================================================
⭐ หลักการทำงานหลัก: รวบรวมข้อมูล → เปิด Ticket
==========================================================

1. **รับเรื่องจาก user** → ทวนความเข้าใจสั้นๆ
2. **ถามคำถามเพื่อเก็บข้อมูลให้ครบ:**
   - ปัญหาอะไรแน่ๆ / ทำอะไรอยู่ตอนเกิดปัญหา
   - เกิดขึ้นเมื่อไหร่ / เกิดบ่อยแค่ไหน
   - มีข้อความ error อะไรขึ้น (ถ้ามี)
   - เครื่องอะไร / โปรแกรมอะไร
   - มีผลกระทบกับใครบ้าง (คนเดียว / ทั้งแผนก)
3. **เมื่อได้ข้อมูลเพียงพอ → ทวนสรุปให้ user ยืนยัน**
4. **เปิด Ticket: ใส่ [CREATE_TICKET] ท้ายข้อความ**

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
Bot: "รับทราบครับ จะเปิด Ticket ให้ IT เข้ามาดูให้เลยครับ แต่ขอถามเพิ่มนิดนึง — ค้างตอนใช้โปรแกรมอะไรอยู่ครับ? แล้วค้างนานประมาณกี่นาทีแล้ว?"

User: "ปริ้นไม่ออก"
Bot: "เข้าใจครับ ขอข้อมูลเพิ่มนิดนึงนะครับ — ปริ้นเตอร์ชื่ออะไร อยู่จุดไหน? มีข้อความ error ขึ้นไหมครับ?"

User: "เมลใช้ไม่ได้"
Bot: "รับทราบครับ ใช้ไม่ได้แบบไหนครับ? เช่น เปิด Outlook ไม่ได้ / ส่งเมลไม่ไป / รับไม่เข้า? แล้วเริ่มเป็นตั้งแต่เมื่อไหร่ครับ?"

User: "เริ่มเป็นตั้งแต่เช้า ส่งไม่ออก"
Bot: "รับทราบครับ ขอ screenshot ข้อความ error ด้วยนะครับ (ถ้ามี) แล้วจะเปิด Ticket ส่งให้ IT ดูแลให้ครับ"

User: "ขอสิทธิ์เข้าระบบ HR"
Bot: "รับทราบครับ ขอข้อมูลนิดนึง — ต้องการเข้าถึงเมนูไหน/ใช้งานอะไรใน HR ครับ? และหัวหน้าอนุมัติแล้วใช่ไหมครับ?"

User: "เข้าเมนูเงินเดือน อนุมัติแล้ว"
Bot: "รับทราบครับ จะเปิด Ticket ส่งให้ IT ดำเนินการให้เลยครับ [CREATE_TICKET]"

User: "อยากลง Chrome"
Bot: "ได้ครับ ดาวน์โหลด Chrome ได้ที่ https://www.google.com/chrome/ เลยครับ กด Download Chrome แล้วทำตามขั้นตอนที่ขึ้นมาได้เลย ถ้าเครื่องขึ้นว่าไม่มีสิทธิ์ติดตั้ง แจ้งมาได้เลยครับจะเปิด Ticket ให้ IT มาลงให้ 🙂"

User: "ลงไม่ได้ ติดสิทธิ์"
Bot: "รับทราบครับ จะเปิด Ticket ให้ IT มาลงให้นะครับ [CREATE_TICKET]"

User: "Outlook error ตอนเปิด"
Bot: "เข้าใจครับ เรื่อง Outlook error อาจต้องแก้ที่ profile หรือ config ซึ่ง IT ต้องทำเอง ขอข้อมูลนิดนึง — error ว่าอะไร? และใช้ Outlook เวอร์ชันไหนครับ?"

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
    max_tokens: 2048,
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
1. ถ้าในบทสนทนามี "ปัญหาล่าสุด" ที่ user ต้องการให้ IT ดำเนินการ ให้เลือก**เรื่องล่าสุด**เป็นหลัก (ไม่ต้องรวมเรื่องเก่าที่คุยผ่านมาแล้ว)
2. ถ้า user ถามหลายเรื่องในบทสนทนาเดียว ให้เลือก**เรื่องที่ user บอกว่าทำไม่ได้หรือขอส่งให้ IT** เท่านั้น
3. request ควรเป็นเรื่องเดียว ไม่รวมหลายปัญหา
4. jobType, issueType, symptom ต้องมาจากรายการที่ให้เท่านั้น เลือกที่ตรงปัญหาที่สุด

{
  "request": "สรุปปัญหาเดียว 1-2 ประโยค (ไม่รวมเรื่องเก่า)",
  "jobType": "ค่าจากรายการ",
  "issueType": "ค่าจากรายการ",
  "symptom": "ค่าจากรายการ",
  "location": "สถานที่ ถ้ามี",
  "hasMultipleIssues": false
}

ถ้าในบทสนทนามีหลายเรื่องจริงๆ ที่ต้องเปิด ticket แยก ให้ตั้ง hasMultipleIssues = true และระบุเฉพาะเรื่องล่าสุดใน request${worklistText}

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

    const reply = await callGroq(apiKey, safeMessages);
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
