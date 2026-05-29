# IT Ticket — Business Workflow

> **URL:** https://project-code-wine.vercel.app
> กระบวนการแจ้งปัญหา IT ตั้งแต่ User เจอปัญหา → ปิดเคส

---

## ผู้เกี่ยวข้อง

| Role | ชื่อ | บทบาท |
|------|-----|-------|
| 🟣 **Manager** | คุณเบิร์ด | ดูภาพรวมทุกอย่าง |
| 🟠 **Senior Mgr ICT** | คุณวี | ดูแลงาน ICT (ลงมือแก้เอง) |
| 🟠 **Senior Mgr Comets** | คุณแชมป์ | ดูแลงาน Comets (มอบหมาย/แก้เอง) |
| 🔵 **IT Officer** | คุณปุ๊ก, คุณยาม้าล | แก้ปัญหาฝั่ง Comets |
| ⚪ **User** | พนักงานทั่วไป | แจ้งปัญหา, กรอก Priority, ยืนยันปิดงาน |

---

## Flow การทำงานทั้งหมด

```mermaid
flowchart TD
    Start([⚪ User เจอปัญหา]) --> AI{ลองถาม AI ก่อน}
    AI -->|แก้ได้| EndAI([จบ ✅])
    AI -->|ไม่หาย| Form[⚪ กรอกฟอร์มแจ้งปัญหา<br/>+ เลือก Priority เอง<br/>+ แนบรูป/ไฟล์]
    Form --> New[📩 เคสใหม่<br/>รอทีม IT รับ]

    New --> Side{ผู้แจ้งสังกัดไหน?}

    Side -->|ICT| V[🟠 Sr.Mgr วี<br/>รับเรื่อง + ลงมือแก้เอง]
    Side -->|Comets| Champ[🟠 Sr.Mgr แชมป์<br/>รับเรื่อง]

    Champ --> Assign{เลือกวิธี}
    Assign -->|มอบหมาย| Off[🔵 Officer ปุ๊ก/ยาม้าล<br/>ลงมือแก้]
    Assign -->|ทำเอง| ChampFix[🟠 Sr.Mgr แชมป์<br/>ลงมือแก้เอง]

    V --> Contact[📞 ติดต่อ User<br/>สอบถามเพิ่มเติม + แก้ไข]
    Off --> Contact
    ChampFix --> Contact

    Contact --> Report[✅ แจ้งผล User<br/>บันทึกวิธีแก้]
    Report --> Check[⚪ User ทดสอบ/ตรวจผล]

    Check --> Result{ผลเป็นยังไง?}
    Result -->|หาย| Close([🎉 ปิดเคส])
    Result -->|ไม่หาย ↻| New
    Result -.เงียบ 7 วัน.-> Auto([⏱ ระบบปิดอัตโนมัติ])

    Start -.ยังไม่ได้ลงทะเบียน.-> Reg
    Reg[พนักงานใหม่ กรอกฟอร์ม<br/>→ ใช้งานได้ทันที]
    Reg -.เสร็จ.-> Start

    style Start fill:#e5e7eb,color:#000
    style Form fill:#e5e7eb,color:#000
    style Check fill:#e5e7eb,color:#000
    style New fill:#fef3c7,color:#000
    style V fill:#f59e0b,color:#fff
    style Champ fill:#f59e0b,color:#fff
    style ChampFix fill:#f59e0b,color:#fff
    style Off fill:#3b82f6,color:#fff
    style Contact fill:#3b82f6,color:#fff
    style Report fill:#10b981,color:#fff
    style Close fill:#10b981,color:#fff
    style EndAI fill:#10b981,color:#fff
    style Auto fill:#6366f1,color:#fff
    style Reg fill:#ec4899,color:#fff
```

---

## ระดับความเร่งด่วน (SLA)

*นับเฉพาะเวลาทำงาน จ–ศ 08:00–17:00 | User เลือกเอง*

| Priority | ตัวอย่าง | ต้องเสร็จภายใน |
|:--------:|---------|:---------------:|
| 🔴 **ด่วนมาก** | งานหยุด / ผู้บริหาร / ปิดงบ | **2 ชม.** |
| 🟠 **สำคัญ** | ต้องใช้วันนี้ | **4 ชม.** |
| 🟡 **ปกติ** | รบกวนแต่มีทางแก้ชั่วคราว | **8 ชม.** |
| ⚪ **ไม่เร่ง** | ขอสิทธิ์ / ติดตั้งโปรแกรม | **24 ชม.** |

> ⏱ **เกิน SLA** → ระบบแค่แจ้งเตือน ไม่มี escalate / ไม่เปลี่ยนคนรับงาน

---

## ขอบเขตความรับผิดชอบ

| กิจกรรม | ⚪ User | 🔵 Officer | 🟠 Sr.Mgr | 🟣 Manager |
|---------|:----:|:----:|:----:|:----:|
| แจ้งปัญหา + กรอก Priority | ✅ | ✅ | ✅ | ✅ |
| รับงานมาแก้ | — | ✅ | ✅ | — |
| มอบหมายให้ Officer | — | — | ✅ *(Comets)* | — |
| บันทึกวิธีแก้ | — | ✅ | ✅ | — |
| ยืนยันปิดงาน | ✅ | — | — | — |
| ดูภาพรวม | — | *(งานตัวเอง)* | ตามสังกัด | ทุกอย่าง |

---

## เงื่อนไขสำคัญ

- **ICT ไม่มี Officer** → Sr.Mgr วี แก้เอง
- **Comets** → Sr.Mgr แชมป์ เลือกได้ว่าจะมอบให้ Officer หรือแก้เอง
- **Priority** → User กรอกเอง ตอนเปิด Ticket
- **ลงทะเบียน User ใหม่** → พนักงานกรอกฟอร์มเอง → **ใช้งานได้ทันที** (ไม่ต้องรออนุมัติ)
- **User เงียบ 7 วัน** → ถือว่าแก้ได้แล้ว ปิดเคสอัตโนมัติ
- **เกิน SLA** → ระบบแจ้งเตือนให้รับรู้เท่านั้น
