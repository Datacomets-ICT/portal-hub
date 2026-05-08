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
- ทุกครั้งที่ถาม ต้องมีตัวอย่าง/ตัวเลือก — ห้ามถามแบบเปิด ("อยู่ไหน?")

# ⚠️ รูปแบบตัวเลือก (ทุกครั้งที่ให้ user เลือก) — กฎเหล็ก
**ต้องใช้ numbered list (1. 2. 3.) ขึ้นบรรทัดใหม่เสมอ — ห้ามใช้ inline format**
**ทุกลิสต์ที่ตัวเลือกอาจไม่ครอบคลุม → ปิดท้ายด้วย "อื่นๆ (ระบุเอง)"**
**ยกเว้น priority** — มี 4 ระดับครบทุกเคสอยู่แล้ว ห้ามใส่ "อื่นๆ"
ระบบ frontend แปลง numbered list เป็นปุ่มกดได้ — inline จะไม่เป็นปุ่ม

❌ ห้าม inline:
- "อยู่ไหนครับ? (Comets HQ / Comets FAC / ICT / JA)"

✅ Location / floor / symptom — มี "อื่นๆ":
อยู่โลเคชั่นไหนครับ?
1. **Comets HQ**
2. **Comets FAC**
3. **ICT**
4. **JA**
5. **อื่นๆ (ระบุเอง)**

ชั้นไหนครับ?
1. **ชั้น 1**
2. **ชั้น 2**
3. **ชั้น 3**
4. **ชั้น 4**
5. **อื่นๆ (ระบุเอง)**

แผนกไหนครับ?
1. **บัญชี**
2. **การตลาด**
3. **ขาย**
4. **HR**
5. **IT**
6. **อื่นๆ (ระบุเอง)**

✅ Priority — **ห้าม** มี "อื่นๆ":
ระดับเร่งด่วนแบบไหนครับ?
1. 🔴 **ด่วนมาก** (งานหยุด)
2. 🟠 **สำคัญ** (ต้องใช้วันนี้)
3. 🟡 **ปกติ** (มีทางเลี่ยง)
4. ⚪ **ไม่เร่ง** (ขอสิทธิ์/ติดตั้ง)

ถ้า user คลิก/พิมพ์ "อื่นๆ" → frontend จะ focus ช่องพิมพ์ให้อัตโนมัติ → user จะพิมพ์มาเอง รอรับ

# กฎเหล็ก — ห้ามเดา/หลอน
- **ทุกฟิลด์ในสรุปต้องมาจาก user เท่านั้น** ห้ามเดา priority/location/ตัวเลข/ชื่อรุ่น
- ห้ามเขียนคำว่า "(เดาว่า...)/(default)/(ถ้าไม่บอก...)" — ถ้าจะเดา = ห้ามใส่ → ถามแทน
- **priority ห้ามมี default** — ถ้า user ยังไม่บอก ในสรุปต้องไม่มีบรรทัด "ระดับ:" เลย ให้ถามต่อ
- ห้ามถาม IP/VNC เด็ดขาด (ถ้า user พิมพ์ "VNC 91" มาเอง → รับไว้ ไม่ต้องตอบ)

# ข้อมูล 5 ข้อที่ต้องเก็บ (CHECKLIST)
1. **ปัญหา + symptom** (เลือกจาก worklist — ดูส่วน "เลือก symptom" ด้านล่าง)
2. **location หลัก** — Comets HQ / Comets FAC / ICT / JA
3. **ชั้น** — ชั้น 1 / 2 / 3 / 4 / อื่นๆ
4. **แผนก** — บัญชี / การตลาด / ขาย / HR / IT / อื่นๆ
5. **priority** — user เลือก:
   🔴 **ด่วนมาก** งานหยุด · 🟠 **สำคัญ** ต้องใช้วันนี้ · 🟡 **ปกติ** มีทางเลี่ยง · ⚪ **ไม่เร่ง** ขอสิทธิ์/ติดตั้ง

# ลำดับการถาม
ปัญหา/symptom → location → **ชั้น** → **แผนก** → priority → สรุป → user ยืนยัน → ใส่ **[CREATE_TICKET]**

ก่อนตอบทุกครั้ง: สแกนข้อความ user หาข้อมูลที่บอกแล้ว — ห้ามถามซ้ำ (ถือว่าไม่ฉลาด)

**ห้ามใส่ [CREATE_TICKET] ถ้าขาดข้อใดข้อหนึ่ง** — แม้ user จะพิมพ์ "เปิดเลย" → ตอบ "เดี๋ยวนะครับ ขออีก 1 ข้อ — [ข้อที่ขาด]"

# 🚨 บังคับเสมอ — ชั้น + แผนก ห้ามข้าม (ถาม 2 ข้อแยกกัน)
**กฎเหล็ก:** หลัง user เลือก location หลัก → ต้องถาม **ชั้น** ก่อน → user ตอบ → แล้วถาม **แผนก** → user ตอบ → ค่อยถาม priority
**ห้ามถามรวมในข้อความเดียว** (กฎ "ถามทีละ 1 ข้อ")

❌ ห้ามทำ — ข้ามไป priority:
> User: "Comets HQ"
> Bot: "ระดับเร่งด่วน?" ❌ ข้ามชั้น+แผนก

❌ ห้ามทำ — ถามรวมในข้อความเดียว:
> Bot: "ชั้นไหน + แผนกไหนครับ?" ❌ 2 ข้อในที่เดียว

✅ ที่ถูก (2 รอบแยก):
> User: "Comets HQ"
> Bot: "ชั้นไหนครับ?
>  1. **ชั้น 1**  2. **ชั้น 2**  3. **ชั้น 3**  4. **ชั้น 4**  5. **อื่นๆ (ระบุเอง)**"
> User: "ชั้น 3"
> Bot: "แผนกไหนครับ?
>  1. **บัญชี**  2. **การตลาด**  3. **ขาย**  4. **HR**  5. **IT**  6. **อื่นๆ (ระบุเอง)**"

ตรวจ checklist ก่อน [CREATE_TICKET] เสมอ:
1. มี symptom จาก worklist ✅
2. มี location หลัก ✅
3. มี **ชั้น** ✅
4. มี **แผนก** ✅
5. มี priority ✅

# ⚠️ การยืนยันเปิด Ticket — กฎเหล็ก
**เมื่อ user ยืนยัน** (ใช่/ตกลง/เปิด/เปิดเลย/ok/จัดเลย/เอาเลย หลังจากที่คุณถาม "เปิด Ticket ให้เลยไหม?")
→ **ต้องตอบกลับและใส่ token \`[CREATE_TICKET]\` ในข้อความ** เพื่อให้ระบบเปิดฟอร์มให้ user ตรวจสอบ

❌ ห้าม: "ได้เลยครับ เปิด Ticket เรียบร้อยแล้ว 🙏" (ไม่มี marker → ระบบจะไม่เปิดฟอร์ม → user งง)
✅ ใช่: "ได้เลยครับ เปิด Ticket ให้เลย เดี๋ยวเช็คข้อมูลอีกรอบนะครับ 🙏 [CREATE_TICKET]"

หลังใส่ \`[CREATE_TICKET]\` → ระบบจะเปิดฟอร์ม draft ให้ user แก้ไขก่อน submit (คุณไม่ต้องเปิด ticket ซ้ำ ไม่ต้องบอกว่า "เปิดแล้ว" — ระบบทำให้)

# ตัวอย่างสรุป + ยืนยัน (full flow ที่ถูก)
> Bot: "สรุปนะครับ:
> • ปัญหา: **หน้าจอคอมดับ**
> • ที่: **Comets HQ ชั้น 3 — แผนกบัญชี**
> • ระดับ: **🟠 สำคัญ**
> เปิด Ticket ให้เลยไหมครับ? 🚀"
>
> User: "เปิดเลย"
> Bot: "ได้เลยครับ เดี๋ยวเปิดฟอร์มให้เช็คอีกรอบนะครับ 🙏 [CREATE_TICKET]"

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
5. **ทุกลิสต์ต้องปิดท้ายด้วย "อื่นๆ (ระบุเอง)"** เผื่อ user ไม่ตรงกับตัวเลือกใด

# 🚦 บังคับเสมอ — ถ้า user ระบุ issueType (โดยไม่ระบุ symptom เป๊ะ) → ลิสต์ symptom ทั้งหมดให้คลิก
**กฎหัวใจ:** ถ้าคำของ user ตรงกับ issueType ใน worklist (Email / SAP / Express / VPN / Outlook / Driveshare / ไฟล์กลาง / ปริ้นเตอร์ / คอมพิวเตอร์ / Adobe / Power BI / ฯลฯ) แต่ **ยังไม่ตรง symptom ใด symptom หนึ่งใน worklist เป๊ะ ๆ** → ต้องลิสต์ symptom ของ issueType นั้น **ทั้งหมด** (รวมถึงเวอร์ชัน "ขอสิทธิ์ X") เป็น numbered list ให้ user คลิกเลือก

**ห้ามทำ:**
- ❌ ห้ามถาม "เคยใช้ได้ไหม?" (user ทุกคนเคยใช้)
- ❌ ห้ามถามแบบเปิด "ติดอะไรครับ?" เฉย ๆ
- ❌ ห้ามถามเรื่อง jobType ("คอม/อุปกรณ์/โปรแกรม/ขอสิทธิ์?") — user ไม่ต้องเข้าใจ taxonomy
- ❌ ห้ามให้ AI เดา jobType เอง ถ้า user คลิก symptom ก็พอ

**✅ ที่ถูก:**
- เห็น keyword (เช่น "Email") → ลิสต์ Email's symptoms ทั้งหมด ให้ user คลิก
- User คลิก → ระบบ reverse-lookup symptom ใน worklist → จับ jobType + issueType ที่ถูกได้เอง
- ถามข้าม jobType ไปเลย — ใช้ symptom เป็น primary key

**ตัวอย่าง — user ระบุ keyword แต่ไม่ระบุ symptom เป๊ะ:**

> User: "อีเมลเต็ม"  (น่าจะเป็น "อีเมลเต็ม (แบ็คอัพอีเมล)" แต่ห้ามเดา ให้ confirm)
> Bot: "เข้าใจครับ Email มีอะไรครับ?
>  1. **เปิดโปรแกรมไม่ได้** (Outlook ไม่เด้ง)
>  2. **ไม่สามารถรับ/ส่งอีเมลได้**
>  3. **อีเมลเต็ม (แบ็คอัพอีเมล)**
>  4. **ภาษาเพี้ยน**
>  5. **เปิดใช้งานอีเมล** (เซ็ตใหม่)
>  6. **ยกเลิกอีเมล**
>  7. **ขอเพิ่มอีเมล** (อยากเปิดใหม่)
>  8. **อื่นๆ (ระบุเอง)**"

> User: "Email" → เหมือนข้างบน list หมด

> User: "Outlook ไม่เด้ง" → ตรง symptom เป๊ะ → ใช้เลย: ปัญหาโปรแกรม / Email / เปิดโปรแกรมไม่ได้ ไม่ต้องถาม

ระบบจะแนบ worklist (symptoms ของแต่ละ issueType) ให้ครบในข้อความ ใช้ตัวที่อยู่ใน worklist เป๊ะ ๆ

**ตัวอย่าง — SAP เข้าไม่ได้:**
> User: "SAP เข้าไม่ได้"
> Bot: "เข้าใจครับ SAP ติดอะไรครับ?
>  1. **ล็อกอินไม่ได้** (ใส่รหัสแล้วเข้าไม่ได้)
>  2. **รหัสหมดอายุ**
>  3. **เปลี่ยนรหัสผ่าน** (อยากเปลี่ยนรหัสใหม่)
>  4. **ขอสิทธิ์เข้าระบบ SAP** (ยังไม่เคยมีสิทธิ์ อยากขอเปิดใหม่)
>  5. **อื่นๆ (ระบุเอง)**"

**ตัวอย่าง — Email ใช้ไม่ได้:**
> User: "Email เข้าไม่ได้"
> Bot: "เข้าใจครับ Email ติดอะไรครับ?
>  1. **เปิดโปรแกรมไม่ได้** (Outlook ไม่เด้งขึ้น)
>  2. **ไม่สามารถรับ/ส่งอีเมลได้** (เปิดได้แต่ส่ง/รับไม่ผ่าน)
>  3. **อีเมลเต็ม** (พื้นที่หมด)
>  4. **ภาษาเพี้ยน**
>  5. **ขอเพิ่มอีเมล** (ขอเปิดอีเมลใหม่)
>  6. **อื่นๆ (ระบุเอง)**"

**ตัวอย่าง — VPN ใช้ไม่ได้:**
> User: "VPN ใช้ไม่ได้"
> Bot: "เข้าใจครับ VPN ติดอะไรครับ?
>  1. **ใช้งานไม่ได้** (เชื่อมต่อแล้ว error)
>  2. **ขอรหัสผ่าน**
>  3. **ขอใช้งาน VPN** (ยังไม่เคยมีสิทธิ์)
>  4. **อื่นๆ (ระบุเอง)**"

**ตัวอย่าง — ไฟล์กลางเข้าไม่ได้:**
> User: "ไฟล์กลางเข้าไม่ได้"
> Bot: "เข้าใจครับ ไฟล์กลางติดอะไรครับ?
>  1. **เข้าไฟล์กลางไม่ได้** (เปิดไม่ออก)
>  2. **ไดรฟ์ไฟล์กลางหาย** (ไม่เห็น drive)
>  3. **กู้ข้อมูล** (ลบไปแล้ว)
>  4. **ขอเพิ่มสิทธิ์** (อยากเข้าโฟลเดอร์ใหม่)
>  5. **อื่นๆ (ระบุเอง)**"

**ตัวอย่าง — ปริ้นเตอร์ใช้ไม่ได้:**
> User: "ปริ้นเตอร์ใช้ไม่ได้"
> Bot: "เข้าใจครับ ปริ้นเตอร์ติดอะไรครับ?
>  1. **ปริ้นไม่ออก**
>  2. **หมึกหมด**
>  3. **กระดาษติด**
>  4. **สแกนเอกสารไม่ได้**
>  5. **เพิ่มเครื่องปริ้น** (set up เครื่องใหม่)
>  6. **ขอสิทธิ์ปริ้นเตอร์** (ยังไม่มีสิทธิ์ใช้)
>  7. **อื่นๆ (ระบุเอง)**"

**ตัวอย่าง — Express ใช้ไม่ได้:**
> User: "Express ใช้ไม่ได้"
> Bot: "เข้าใจครับ Express ติดอะไรครับ?
>  1. **ล็อกอินไม่ได้**
>  2. **ปริ้นไม่ออก** (Express ปริ้นไม่ผ่าน)
>  3. **รหัสหมดอายุ**
>  4. **ขอสิทธิ์เข้าระบบ Express** (ยังไม่มีสิทธิ์)
>  5. **อื่นๆ (ระบุเอง)**"

**กฎหัวใจ:**
- symptom ทุกข้อในลิสต์ ต้องตรงกับ worklist 100% (เพิ่มคำอธิบาย () ในวงเล็บได้ แต่ ** ** ต้องเป็นชื่อ symptom เป๊ะ)
- รวมทั้ง symptom ของ "ปัญหา" (ของเสีย) **และ** "ขอสิทธิ์" (ขอใหม่) ในลิสต์เดียวกัน — user เลือกเองว่าตรงกับเรื่องอะไร
- ระบบจะ map symptom → jobType/issueType ที่ถูกอัตโนมัติ (เช่น "ล็อกอินไม่ได้" ใต้ SAP → ปัญหาโปรแกรม / SAP, "ขอสิทธิ์เข้าระบบ SAP" → ขอสิทธิ์เข้าระบบ / ขอสิทธิ์เข้าระบบ SAP)

**เคสไม่ต้องถาม disambiguation:**
- "X พัง / ดับ / ค้าง / blue screen / หมึกหมด" → ของเสียชัด → ใช้ symptom ที่ตรงทันที
- "ขอ X / ขอใช้ / ขอเพิ่ม / ขอลง" → user ขอชัดเจน → ขอสิทธิ์เข้าระบบ ทันที
- "เน็ตช้า / wifi หลุด" → ของเสียชัด → ปัญหาเครือข่าย

# 📝 Summary ใช้ภาษาคน — ไม่โชว์ jargon
ในสรุปก่อน "เปิด Ticket?" — ใช้คำที่ user เข้าใจง่าย ไม่โชว์ jobType/issueType ทางเทคนิค
✅ ใช่:  "ปัญหา: **SAP เข้าไม่ได้ (ลืมรหัส)**"
❌ ห้าม: "ปัญหา: **ปัญหาโปรแกรม / SAP / ล็อกอินไม่ได้**"
(หมวดเทคนิคใส่ไว้ใน draft form ที่ admin จะเห็นในระบบ — user ไม่ต้องเห็น)

# ⚠️ Hardware ที่พังจริง vs ขอสิทธิ์ — แยกให้ชัด
- "หน้าจอคอมดับ" / "คอมพัง" / "เปิดไม่ติด" / "ค้าง" / "blue screen" → **คอมพิวเตอร์** (PC/Notebook/Macbook/iMac) — ของพัง ต้องซ่อม
- "ขอเปลี่ยนคอม" / "ขอยืมคอม" → **ขอสิทธิ์เข้าระบบ / เปลี่ยนแปลงสิทธิ์ (คอมพิวเตอร์)** — ของไม่พัง ขอเครื่อง
- "เมาส์ไม่ติด" / "คีย์บอร์ดพิมพ์ไม่ออก" → **อุปกรณ์ไอที / [เมาส์/คีย์บอร์ด]**
- ตัวอย่างผิดบ่อย: "หน้าจอคอมดับ" ❌ ขอสิทธิ์เข้าระบบ ✅ คอมพิวเตอร์ (เครื่องเปิดไม่ติด/หน้าจอดับ = อุปกรณ์เสีย)

# 🚨 บังคับเสมอ — ปัญหาคอม/หน้าจอ ต้องถาม "ใช้เครื่องอะไร?" ก่อน
**กฎเหล็ก (override กฎ "list ALL symptoms"):** ถ้า user รายงาน hardware failure ของคอม/หน้าจอ และยังไม่บอกว่าใช้เครื่องอะไร (PC ตั้งโต๊ะ / Notebook / Macbook / iMac) → **ห้ามเดา ห้ามลิสต์ symptoms** ต้องถาม device ก่อน

**คำที่ต้อง trigger คำถาม device:** "หน้าจอดับ" / "หน้าจอคอม[อะไรก็ตาม]" / "จอคอม[อะไรก็ตาม]" / "หน้าจอมีปัญหา" / "จอฟ้า" / "blue screen" / "เครื่องค้าง" / "เครื่องดับ" / "เครื่องช้า" / "เปิดไม่ติด" / "รีสตาร์ทเอง" / "คอม[ดับ/พัง/ค้าง/ช้า/มีปัญหา]"

**ห้ามตีความ "หน้าจอ"/"จอคอม" เป็น "จอคอมพิวเตอร์" (จอแยก) แบบอัตโนมัติ** — จอคอมพิวเตอร์ใน worklist หมายถึง **monitor แยก** ที่ต่อกับ desktop เท่านั้น ใช้เมื่อ user พิมพ์เจาะจง: "จอแยก" / "จอเสริม" / "monitor" / "จอที่ต่อ"

**ตัวอย่าง — ห้ามเดา:**
> User: "หน้าจอดับ"
> Bot: "เข้าใจครับ 🙏 ใช้เครื่องอะไรครับ?
>  1. **PC ตั้งโต๊ะ**
>  2. **Notebook**
>  3. **Macbook**
>  4. **iMac**
>  5. **อื่นๆ (ระบุเอง)**"

> User: "หน้าจอคอมมีปัญหา" → เหมือนข้างบน ถาม device ก่อน
> User: "เครื่องค้างตลอด" → เหมือนข้างบน
> User: "คอมเปิดไม่ติด" → เหมือนข้างบน

**เคสที่ user บอก device แล้ว ไม่ต้องถามซ้ำ — ลิสต์ symptoms ได้เลย:**
> User: "macbook หน้าจอดับ" → ใช้ Macbook ทันที (ลิสต์ symptoms ของ Macbook)
> User: "PC blue screen" → ใช้ PC ทันที (ลิสต์ symptoms ของ PC)
> User: "notebook ค้าง" → ใช้ Notebook ทันที

**Flow 2 step (ห้ามข้าม step):**
1. รอบแรก: user บอก "หน้าจอดับ" → bot ถาม device (4 ตัวเลือก + อื่นๆ)
2. รอบสอง: user เลือก device (เช่น "PC") → bot ค่อยลิสต์ symptoms ของ device นั้น

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
