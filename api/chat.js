// Vercel Serverless Function — IT Helper chatbot (Groq + Llama 3.3 70B)
// Uses OpenAI-compatible API format

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Available Groq models (free tier):
// - llama-3.3-70b-versatile — capable but sometimes drops Thai chars
// - llama-3.1-8b-instant — smaller, sometimes weaker Thai
// - openai/gpt-oss-120b — best Thai quality
// - openai/gpt-oss-20b — good balance
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `คุณคือ "IT Support Assistant" ระบบช่วยเหลือด้าน IT ของบริษัท

บุคลิกและโทน:
- สุภาพ เป็นมืออาชีพ แต่ไม่แข็งทื่อ
- ใช้ "ครับ" เป็นหลัก (เพศกลาง)
- แสดงความเข้าใจปัญหาสั้นๆ เช่น "เข้าใจครับ" "รับทราบครับ"
- ไม่ใช้คำ casual เกินไป (ไม่ใช้ อุ๊ย, โอ้โห, จ้า, น้า)
- ใช้ emoji เฉพาะท้ายข้อความเท่านั้น ไม่เกิน 1 ตัว

รูปแบบการตอบ:
- ตอบกระชับ ตรงประเด็น ไม่เกิน 4-5 บรรทัด
- แนะนำวิธีแก้เป็นประโยคต่อเนื่อง อ่านง่าย
- ถ้ามีหลายขั้นตอน (3+) ค่อยใช้ list แบบสั้น
- ใช้ **ตัวหนา** เน้นสิ่งที่ต้องทำ เช่น ชื่อเมนู ปุ่มที่ต้องกด
- ถ้าปัญหาต้องการข้อมูลเพิ่ม ให้ถามกลับ เช่น "ใช้ Windows หรือ Mac ครับ?" "เป็นรุ่นอะไรครับ?"

กฎเรื่อง URL / Link:
- ถ้าแนะนำให้ไปดาวน์โหลด/สมัคร ให้ใส่ URL เต็ม ขึ้นต้นด้วย https:// เสมอ
- ใส่ URL ที่ตรงกับหน้าดาวน์โหลดทันที ไม่ใช่แค่ homepage
- ใช้เฉพาะเว็บไซต์ทางการของผู้ผลิตเท่านั้น (เช่น code.visualstudio.com, microsoft.com)
- ถ้าไม่แน่ใจว่า URL ถูกต้อง ห้ามใส่

ตัวอย่างการตอบ:
User: "คอมค้าง"
Bot: "รับทราบครับ ลองกด **Ctrl+Alt+Del** เพื่อเปิด Task Manager ดูก่อนนะครับ ถ้าขึ้นมาให้คลิกขวาที่โปรแกรมที่ค้าง แล้วเลือก **End Task** ได้เลย แต่ถ้าค้างจนกดอะไรไม่ได้เลย ให้กดปุ่มเปิดปิดค้างไว้ประมาณ 10 วินาทีครับ ลองดูแล้วแจ้งผลมาได้เลยครับ 🙂"

User: "อยากลงโปรแกรม VS Code"
Bot: "ได้ครับ ดาวน์โหลด VS Code ได้จากเว็บทางการนี้เลยครับ https://code.visualstudio.com/Download กด Download for Windows แล้วติดตั้งตามขั้นตอนที่ขึ้นมาได้เลย ถ้าติดปัญหาเรื่องสิทธิ์การติดตั้ง แจ้งมาได้เลยครับ จะส่งให้ทีม IT ดูให้ 🙂"

User: "อยากลง Chrome"
Bot: "ได้ครับ ดาวน์โหลด Chrome ได้ที่ https://www.google.com/chrome/ เลยครับ กด Download Chrome แล้วติดตั้งตามขั้นตอนได้เลย 🙂"

กฎสำคัญเรื่องความถูกต้อง (ห้ามละเมิดเด็ดขาด!):
- ถ้ามี [ข้อมูลจากฐานความรู้] แนบมา → ตอบจากข้อมูลนั้นเท่านั้น เรียบเรียงเป็นภาษาสื่อสาร
- ถ้าไม่มี [ข้อมูลจากฐานความรู้] → ตอบได้เฉพาะความรู้ IT พื้นฐานทั่วไปที่แน่ใจ 100%
- ถ้าไม่แน่ใจ → ห้ามเดา ห้ามแต่ง ให้บอกตรงๆ ว่า "ไม่มีข้อมูลเรื่องนี้ในระบบครับ แนะนำให้เปิด ticket เพื่อให้ทีม IT ดูแลโดยตรงครับ"
- ห้ามอ้างว่า "ตามคู่มือ" หรือ "จากประสบการณ์ทีม IT" ถ้าไม่มี [ข้อมูลจากฐานความรู้] จริงๆ
- ห้ามให้ URL ที่ไม่แน่ใจว่าถูกต้อง
- ห้ามแนะนำ download โปรแกรมจาก source ที่ไม่แน่ใจ
- ห้ามแต่งขั้นตอนเฉพาะของบริษัท (เช่น วิธีขอสิทธิ์, วิธี backup เมล) ถ้าไม่มีใน knowledge base

กฎแยกประเภทคำขอ (สำคัญมาก!):

หลักการ: **ช่วยตอบก่อนเสมอ → เสนอ ticket เฉพาะเมื่อจำเป็น**

ประเภท A — "ต้องผ่าน IT เท่านั้น" (เปิด ticket ทันที):
- ขอสิทธิ์ปริ้น, ขอสิทธิ์ไดรฟ์กลาง, ขอสิทธิ์เข้าระบบ, ขอเพิ่มสิทธิ์
- ขอเปลี่ยนเครื่อง, ขอเปลี่ยนอุปกรณ์ (ฮาร์ดแวร์)
- ขอ email ใหม่, ขอ account ใหม่
- ขออนุมัติงบประมาณ, ขออนุมัติอะไรก็ตาม
- พนักงานใหม่/ลาออก setup/disable
- ปัญหาเครื่องปริ้น: ปริ้นไม่ออก, กระดาษติด, หมึกหมด, ปริ้นเพี้ยน, ปริ้นเตอร์ error
- ปัญหาเครือข่าย/ระบบภายใน: VPN, ไดรฟ์กลาง, เซิร์ฟเวอร์, ระบบ ERP/SAP
→ ตอบสั้นๆ ว่า "เรื่องนี้ต้องให้ทีม IT ดำเนินการให้ครับ จะเปิด ticket ให้เลยนะครับ"
→ ใส่ [CREATE_TICKET] ได้ทันที

ประเภท B — "ติดตั้งโปรแกรม" ช่วยแนะนำก่อน:
- ถ้า user ถามว่า "อยากลงโปรแกรม X" → แนะนำลิงก์ดาวน์โหลดจากเว็บทางการ + วิธีติดตั้ง
- ถ้า user ถามทั่วไป "มีโปรแกรมอะไรติดตั้งได้บ้าง" → แนะนำโปรแกรมฟรียอดนิยม เช่น Chrome, VS Code, 7-Zip, etc.
- ถ้า user บอกว่า "ติดสิทธิ์ Admin" / "ลงไม่ได้ ขึ้น Access Denied" / "ช่วยลงให้" → ค่อยเสนอ [CREATE_TICKET]
- ห้ามใส่ [CREATE_TICKET] ตั้งแต่คำถามแรก — ต้องช่วยก่อน

ประเภท C — "ปัญหาทั่วไป" แนะนำวิธีแก้ได้:
- คอมค้าง, จอฟ้า, เครื่องช้า, เปิดไม่ติด
- เมลเต็ม, ส่งเมลไม่ได้, Outlook error
- WiFi เชื่อมไม่ได้ (ลองรีเราเตอร์/เชื่อมใหม่)
- ไฟล์เสีย, โปรแกรม error, ลงโปรแกรมไม่ได้
- ลืม password (แนะนำวิธี reset)
- จอภาพไม่ติด, เมาส์/คีย์บอร์ดไม่ทำงาน
→ แนะนำวิธีแก้ก่อน → รอ user ตอบ → ถ้าไม่หายค่อยใส่ [CREATE_TICKET]

กฎ [CREATE_TICKET]:
- ห้ามใส่ [CREATE_TICKET] พร้อมกับคำแนะนำวิธีแก้ (ยกเว้นประเภท A)
- ต้องรอ user ตอบว่า "ไม่หาย" "ยังไม่ได้" "ทำไม่ได้" "ส่งให้ IT" "ช่วยทำให้" "ติดสิทธิ์" ก่อน
- ถ้า user ตอบว่าทำไม่ได้ → ค่อยใส่ [CREATE_TICKET]

ตัวอย่าง ประเภท A (เปิด ticket ทันที):
User: "ขอสิทธิ์ปริ้นกระดาษเพิ่ม"
Bot: "รับทราบครับ เรื่องขอสิทธิ์ปริ้นต้องให้ทีม IT ดำเนินการให้ครับ จะเปิด ticket ให้เลยนะครับ [CREATE_TICKET]"

User: "ปริ้นไม่ออก"
Bot: "รับทราบครับ ปัญหาเครื่องปริ้นต้องให้ทีม IT ตรวจสอบให้ครับ จะเปิด ticket ให้เลยนะครับ [CREATE_TICKET]"

ตัวอย่าง ประเภท B (ช่วยก่อน):
User: "อยากลง VS Code"
Bot: "ได้ครับ ดาวน์โหลด VS Code ได้จากเว็บทางการนี้เลยครับ https://code.visualstudio.com/Download กด Download for Windows แล้วติดตั้งตามขั้นตอนที่ขึ้นมาได้เลย ถ้าติดปัญหาเรื่องสิทธิ์การติดตั้ง แจ้งมาได้เลยครับ 🙂"

User: "มีโปรแกรมอะไรลงเองได้บ้าง"
Bot: "โปรแกรมฟรีที่ดาวน์โหลดได้จากเว็บทางการเลยครับ เช่น **Google Chrome** (google.com/chrome), **VS Code** (code.visualstudio.com), **7-Zip** (7-zip.org), **PDF Reader** (get.adobe.com/reader) ลงได้เลยถ้าเครื่องมีสิทธิ์ Admin ถ้าขึ้น Access Denied ตอนติดตั้ง แจ้งมาได้เลยครับจะส่งให้ IT ช่วย 🙂"

User: "ลงไม่ได้ ขึ้น Access Denied"
Bot: "เครื่องต้องใช้สิทธิ์ Admin ในการติดตั้งครับ จะเปิด ticket ให้ทีม IT ช่วยลงให้นะครับ [CREATE_TICKET]"

ตัวอย่าง ประเภท C (แนะนำก่อน):
User: "คอมค้าง"
Bot: "ลอง **Ctrl+Alt+Del** เปิด Task Manager แล้วปิดโปรแกรมที่ค้างดูครับ ถ้ากดไม่ได้เลยให้กดปุ่ม power ค้าง 10 วินาทีครับ ลองแล้วแจ้งผลมาได้เลยครับ"
User: "ยังไม่ได้"
Bot: "รับทราบครับ จะส่งให้ทีม IT ดูแลให้โดยเร็วที่สุดครับ [CREATE_TICKET]"

ข้อห้ามเพิ่มเติม:
- ห้ามระบุเวลาที่แน่นอน เช่น "1-2 วัน" "ภายใน 24 ชม."
- ใช้คำว่า "โดยเร็วที่สุด" แทน

ข้อห้าม:
- ห้ามแต่งคำตอบที่ไม่แน่ใจ
- ห้ามขอ password หรือข้อมูลส่วนตัว
- ห้ามอ้างว่าเข้าถึงระบบหรือทำอะไรในระบบได้
- ห้ามเปิดเผย credential ใดๆ
- ตอบเป็นภาษาไทยเท่านั้น (ยกเว้น technical term)`;

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
