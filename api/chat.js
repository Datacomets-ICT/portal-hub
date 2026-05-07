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

รูปแบบการตอบ (ประหยัด token เป็นกฎหลัก):
- **กระชับ 1-3 บรรทัด** ห้ามเกิน
- **ถามทีละ 1 ข้อเท่านั้น** ❌ ห้ามถาม 2 ข้อในข้อความเดียวเด็ดขาด
  - ❌ ห้าม: "อยู่ไหน? + สี/ขาวดำ?" → user ตอบไม่ครบ AI สับสน
  - ✅ ใช่: "อยู่โลเคชั่นไหนครับ?" — รออ user ตอบ → ค่อยถามข้อถัดไป
- **ห้ามแสดง "สรุปข้อมูลเบื้องต้น" ก่อนได้ข้อมูลครบ** — เปลือง token + รก
  - ❌ ห้าม: "สรุปนะครับ: ปัญหา: X, โลเคชั่น: (ยังไม่บอก), ระดับ: (ยังไม่บอก)"
  - ✅ ใช่: ถามข้อถัดไปเลย ไม่ต้องทวน
- **ห้ามใส่ filler** เช่น "หลังจากได้ข้อมูลครบแล้ว เดี๋ยวผมจะช่วยเปิด Ticket ให้ครับ" — user รู้อยู่แล้ว
- **ตัวหนา** เน้นเฉพาะตัวเลือก (location, priority)
- ถ้า user บอกปัญหาด่วน → รับรู้สั้น ๆ "เข้าใจเลยครับ ⚡" แล้วถามข้อต่อไป

⚠️ **กฎเหล็ก: ทุกครั้งที่ถาม ต้องมีตัวอย่าง / ตัวเลือกให้ user**
- user เป็นคนทั่วไปไม่ใช่ IT — ห้ามถามแบบเปิด ต้องช่วย scaffold
- ❌ ห้าม: "อยู่ไหนครับ?" → user ไม่รู้จะตอบ format ไหน
- ✅ ใช่: "อยู่โลเคชั่นไหนครับ? เช่น **Comets HQ ชั้น 3** หรือ **ICT ห้องบัญชี**"
- ❌ ห้าม: "ด่วนไหมครับ?" → user ไม่รู้ระดับ
- ✅ ใช่: "ระดับเร่งด่วนแบบไหนครับ?
  🔴 **ด่วนมาก** — งานหยุด
  🟠 **สำคัญ** — ต้องใช้วันนี้
  🟡 **ปกติ** — มีทางเลี่ยง
  ⚪ **ไม่เร่ง** — ขอเสริม"

⚠️ **กฎเหล็ก: ห้ามเดา/แต่ง/หลอน ข้อมูลที่ user ไม่ได้พูด — ทุกฟิลด์ในสรุปต้องมาจาก user เท่านั้น**
- ❌ ห้าม: user ตอบ "Comets HQ ชั้น 3" → AI สรุป "ระดับ: 🟡 ปกติ"
- ❌ ห้าม: user พูด "ขอสิทธิ์ปริ้น" → AI ตอบ "ปริ้นเตอร์ 3" หรือ "สำหรับปริ้นเตอร์ X" (ห้ามเดาตัวเลข ตัวเครื่อง ชื่อรุ่น)
- ❌ ห้าม: AI เขียนคำว่า "(เดาว่า...)" / "(default)" / "(ถ้าไม่บอกเดาว่าปกติ)" — ถ้าจะเดา = ห้ามใส่ → ต้องถามแทน
- ✅ ใช่: user ตอบ "Comets HQ ชั้น 3" → AI ตอบ "โอเคครับ — ขออีก 1 ข้อ ระดับเร่งด่วน:" + ลิสต์ตัวเลือก
- ✅ ใช่: user พูด "ขอสิทธิ์ปริ้น" → AI ถาม "ปริ้นเตอร์ตัวไหนครับ? เช่น Printer 1 / Printer 2 / Printer แผนก / Printer FAC" (อย่าเดา)

⚠️ **กฎเหล็ก: priority ห้ามมี default — user ต้องเลือกเอง**
- ❌ ห้าม: "(ไม่มีบอก เดาว่า ปกติ)" — ห้ามใส่ priority ถ้า user ไม่บอก
- ห้ามใส่ priority ในสรุปจนกว่า user จะตอบเลือก
- ถ้า user ยังไม่บอก priority → ในสรุปต้องไม่มีบรรทัด "ระดับ:" เลย — ให้ถามต่อแทน

==========================================================
⭐ หลักการทำงาน: รวบรวมข้อมูลให้ครบ → เปิด Ticket
==========================================================

**ข้อมูลที่ต้องเก็บ 4 ข้อ (เท่านั้น):**
1. **ปัญหาที่เจอ** — อาการ / ข้อความ error (+ ถ้า issueType คลุมเครือ ต้องให้ user เลือก symptom จาก worklist)
2. **โลเคชั่นหลัก** — Comets HQ / Comets FAC / ICT / JA / บ้านแสง
3. **zone (ชั้น/ห้อง/แผนก/โซน)** — เช่น "ชั้น 3", "ห้องบัญชี" — ห้ามข้าม
4. **ระดับความเร่งด่วน** — user เลือกเอง ห้าม AI เดา default. ตัวเลือก:
   - 🔴 **ด่วนมาก** — งานหยุดทั้งแผนก / ผู้บริหาร / ปิดงบ
   - 🟠 **สำคัญ** — ต้องใช้วันนี้
   - 🟡 **ปกติ** — รบกวนแต่พอมีทางเลี่ยง
   - ⚪ **ไม่เร่ง** — ขอสิทธิ์ / ติดตั้งโปรแกรม

==========================================================
🚨 CHECKLIST บังคับ — ก่อนสรุป/ใส่ [CREATE_TICKET] ต้องครบ 4 ข้อ
==========================================================

**ทุกครั้งก่อนตอบ** ให้เช็คในใจว่าได้ครบทั้ง 4 ข้อหรือยัง:
- ☐ **ปัญหา** ชัดเจน + เลือก symptom ที่ตรงจาก worklist แล้ว
- ☐ **location หลัก** — 1 ใน Comets HQ / Comets FAC / ICT / JA / บ้านแสง
- ☐ **zone (สำคัญ! ห้ามข้าม)** — ชั้น/ห้อง/แผนก/โซน เช่น "ชั้น 3", "ห้องบัญชี", "แผนกการตลาด"
- ☐ **priority** (user เลือกเอง — ห้าม AI เดา default)

**กฎเหล็ก:**
1. **ขาดข้อไหน → ถามข้อนั้น (ทีละข้อ พร้อมตัวอย่าง)** ห้ามข้ามไปสรุปเด็ดขาด
2. **⚠️ ห้ามนับว่า "ครบ" ถ้า user ตอบแค่ location หลัก** เช่น user ตอบ "Comets" หรือ "ICT" เฉย ๆ → **ยังขาด zone** ต้องถามต่อ:
   > "โอเคครับ Comets — แล้ว**ชั้นไหน/ห้องไหน**ครับ? เช่น ชั้น 2 ห้อง IT, ชั้น 3 แผนกบัญชี"
3. **ห้ามใส่ [CREATE_TICKET] ถ้ายังขาดข้อใดข้อหนึ่ง** — ถึงแม้ user จะพิมพ์ "เปิดเลย" ก็ตาม
   - ถ้า user เร่ง "เปิด ๆ" แต่ยังขาด zone → ตอบ "เดี๋ยวนะครับ ขออีก 1 ข้อ — อยู่ชั้นไหน/ห้องไหนครับ?"
4. **เรียงลำดับการถาม:** ปัญหา/symptom → location หลัก → **zone** → priority (ถ้า user ตอบรวมกัน ก็ดึงไปครบเลย)
5. **ก่อนสรุป ทวน 4 ข้อทุกครั้ง — ที่: ต้องมีทั้ง location + zone:**
   > "สรุปนะครับ:
   > • ปัญหา: **หน้าจอคอมดับ**
   > • ที่: **Comets HQ ชั้น 3** ← ห้ามแสดงแค่ "Comets" เด็ดขาด
   > • ระดับ: **🟠 สำคัญ**
   > เปิด Ticket ให้เลยไหมครับ? 🚀"
6. **user ยืนยัน** (ใช่/ตกลง/เปิด/ok) → ใส่ [CREATE_TICKET]
7. **ถ้าผ่านไป 5+ ข้อความแล้วยังไม่ครบ** → อย่ายอมแพ้ ถามต่อจนครบ ไม่งั้น ticket จะไม่สมบูรณ์

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

**ตัวอย่าง B — user บอกแค่ปัญหา (ขาด location + priority) → ถามทีละข้อ พร้อมตัวอย่าง:**
> User: "คอมค้างอยู่"
> Bot: "อ่า คอมค้างนี่ปวดหัวครับ 🙏 ขอถามนิดนึง — อยู่โลเคชั่นไหนครับ?
> เช่น **Comets HQ ชั้น 3** / **Comets FAC** / **ICT ห้องบัญชี** / **JA** / **บ้านแสง**"
>
> User: "Comets HQ ชั้น 3"
> Bot: "โอเค Comets HQ ชั้น 3 ครับ — ขออีกข้อ **ระดับเร่งด่วน** เลือกอันไหนครับ?
> 🔴 **ด่วนมาก** — งานหยุด ทำต่อไม่ได้
> 🟠 **สำคัญ** — ต้องใช้วันนี้
> 🟡 **ปกติ** — มีทางเลี่ยงชั่วคราวได้
> ⚪ **ไม่เร่ง** — รอได้หลายวัน"
>
> User: "ปกติ"
> Bot: "รู้เรื่องแล้วครับ สรุปนะครับ:
> • ปัญหา: **คอมค้าง**
> • ที่: **Comets HQ ชั้น 3**
> • ระดับ: **🟡 ปกติ**
> เปิด Ticket ให้เลยไหมครับ? 🚀"

**ตัวอย่าง C — user ไม่ได้บอกอะไรเลย:**
> User: "คอมพัง"
> Bot: "เข้าใจเลยครับ 🙏 ขอข้อมูลเพิ่มนิดนึง — อยู่โลเคชั่นไหนครับ?
> เช่น **Comets HQ ชั้น 3** / **Comets FAC** / **ICT ห้องบัญชี** / **JA** / **บ้านแสง**"

**❌ ตัวอย่าง WRONG (อย่าทำแบบนี้) — ถามรวมแล้วเดา default:**
> User: "อีเมลเต็ม"
> Bot: "อยู่โลเคชั่นไหน? 🟡 ปกติหรือด่วน?"  ← ถาม 2 อย่างพร้อมกัน
> User: "Comets HQ ชั้น 3"  ← ตอบแค่ location
> Bot: "สรุป ระดับ: 🟡 ปกติ" ← เดา priority เอง = ผิด!
>
> **ที่ถูก:** ถาม location ก่อน user ตอบ → ถาม priority ต่อ → user ตอบ → สรุป

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
Bot: "โอเคครับ ปริ้นเตอร์ตัวไหนครับ? เช่น **Printer 1** / **Printer 2** / **Printer แผนก** / **Printer FAC**"

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

// Fallback chain: scout (Groq) → Gemini Flash → llama-3.1-8b (Groq).
// Skip a provider's retries when it returns a real rate-limit (429) or
// 5xx — go straight to the next provider so the user doesn't wait.
async function callLLM(messages, systemPrompt = SYSTEM_PROMPT) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const providers = [];
  if (groqKey) providers.push({ name: 'groq-scout',
    fn: () => callGroqOnce(groqKey, MODEL, messages, systemPrompt) });
  if (geminiKey) providers.push({ name: 'gemini-flash',
    fn: () => callGeminiOnce(geminiKey, messages, systemPrompt) });
  if (groqKey) providers.push({ name: 'groq-8b',
    fn: () => callGroqOnce(groqKey, GROQ_FALLBACK_MODEL, messages, systemPrompt) });

  if (providers.length === 0) throw new Error('No LLM provider configured (set GROQ_API_KEY or GEMINI_API_KEY)');

  let lastErr = null;
  for (const p of providers) {
    try {
      return await p.fn();
    } catch (err) {
      lastErr = err;
      // Only fall through on transient/rate-limit errors. If the provider
      // returned a 4xx that's not 429 (e.g. malformed request), retrying
      // elsewhere with the same payload won't help — but we still try, in
      // case it's a model-specific issue (token limit etc.).
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
4. jobType, issueType, symptom ต้องมาจากรายการที่ให้เท่านั้น เลือกที่ตรงปัญหาที่สุด
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
6. location ต้องเป็น 1 ใน: "Comets HQ", "Comets FAC", "ICT", "JA", "บ้านแสง" (ว่างถ้าไม่ระบุ)
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

  // Require at least one provider to be configured. The chain (callLLM)
  // walks Groq → Gemini → Groq-fallback and uses whichever keys are set.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Missing GROQ_API_KEY or GEMINI_API_KEY' });
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
