"""
Generate IT Ticket System Proposal PDF v2
- การทำงาน
- วิธีใช้งาน (user + admin)
- ข้อจำกัดทั้งหมด
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
import os

pdfmetrics.registerFont(TTFont('Thai', r'C:\Windows\Fonts\LEELAWAD.TTF'))

# Colors
C1 = HexColor('#4F46E5')  # primary indigo
C2 = HexColor('#0F172A')  # dark text
C3 = HexColor('#475569')  # gray text
C4 = HexColor('#EEF2FF')  # light bg
C5 = HexColor('#10B981')  # green
C6 = HexColor('#EF4444')  # red
C7 = HexColor('#F59E0B')  # orange
W  = white

# Styles
S = {
    'title': ParagraphStyle('T', fontName='Thai', fontSize=24, textColor=C1, leading=32, alignment=1, spaceAfter=4),
    'sub':   ParagraphStyle('S', fontName='Thai', fontSize=13, textColor=C3, leading=18, alignment=1),
    'h1':    ParagraphStyle('H1', fontName='Thai', fontSize=17, textColor=C1, leading=24, spaceBefore=18, spaceAfter=8),
    'h2':    ParagraphStyle('H2', fontName='Thai', fontSize=13, textColor=C2, leading=18, spaceBefore=12, spaceAfter=6),
    'b':     ParagraphStyle('B', fontName='Thai', fontSize=10.5, textColor=C2, leading=16, spaceBefore=2, spaceAfter=2),
    'bl':    ParagraphStyle('BL', fontName='Thai', fontSize=10.5, textColor=C2, leading=16, leftIndent=18, bulletIndent=6, spaceBefore=1, spaceAfter=1),
    'sm':    ParagraphStyle('SM', fontName='Thai', fontSize=9, textColor=C3, leading=13),
}

cs = ParagraphStyle('CS', fontName='Thai', fontSize=9, textColor=C2, leading=13)
ch = ParagraphStyle('CH', fontName='Thai', fontSize=9, textColor=W, leading=13)


def P(t, s=None): return Paragraph(str(t).replace('>', '&gt;').replace('<', '&lt;'), s or cs)
def hr(): return HRFlowable(width='100%', thickness=1, color=HexColor('#E2E8F0'), spaceBefore=6, spaceAfter=6)


def tbl(headers, rows, widths=None):
    data = [[P(h, ch) for h in headers]] + [[P(c) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C1),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D0D0D0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [W, C4]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def build():
    fn = os.path.join(os.path.dirname(__file__), 'IT_Ticket_System_Proposal.pdf')
    doc = SimpleDocTemplate(fn, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = []
    W_ = doc.width

    # ======================== COVER ========================
    story.append(Spacer(1, 80))
    story.append(Paragraph('IT Ticket System', S['title']))
    story.append(Paragraph('ระบบแจ้งปัญหา &amp; ติดตามสถานะงาน IT', S['sub']))
    story.append(Spacer(1, 20))
    story.append(hr())

    sig = ParagraphStyle('Sig', fontName='Thai', fontSize=11, textColor=C2, leading=16)
    cover = [
        [P('จัดทำโดย', sig), P('แผนก IT / สารสนเทศ', sig)],
        [P('วันที่', sig), P(datetime.now().strftime('%d/%m/%Y'), sig)],
        [P('เวอร์ชัน', sig), P('2.0', sig)],
        [P('URL', sig), P('https://project-code-gamma.vercel.app', sig)],
    ]
    t = Table(cover, colWidths=[W_*0.3, W_*0.7])
    t.setStyle(TableStyle([('TOPPADDING', (0,0),(-1,-1), 8), ('BOTTOMPADDING', (0,0),(-1,-1), 8)]))
    story.append(t)
    story.append(PageBreak())

    # ======================== สารบัญ ========================
    story.append(Paragraph('สารบัญ', S['h1']))
    story.append(hr())
    toc = [
        '1. ภาพรวมระบบ',
        '2. วิธีใช้งาน — สำหรับพนักงาน (User)',
        '3. วิธีใช้งาน — สำหรับทีม IT (Admin)',
        '4. AI Chatbot (IT Support)',
        '5. ระบบลงทะเบียน + อนุมัติ',
        '6. FAQ (คำถามที่พบบ่อย)',
        '7. สถาปัตยกรรมระบบ',
        '8. ข้อมูลในระบบปัจจุบัน',
        '9. ข้อจำกัดทั้งหมด',
        '10. ค่าใช้จ่าย',
        '11. แผนพัฒนาต่อ (Roadmap)',
        '12. ข้อเสนอแนะ',
    ]
    for t in toc:
        story.append(Paragraph(t, S['b']))
    story.append(PageBreak())

    # ======================== 1. ภาพรวม ========================
    story.append(Paragraph('1. ภาพรวมระบบ', S['h1']))
    story.append(hr())
    story.append(Paragraph('ระบบ IT Ticket System เป็นแพลตฟอร์มบริหารจัดการงาน IT ภายในองค์กร พัฒนาเป็น Web Application ใช้งานผ่าน Browser ได้ทุกอุปกรณ์ + ติดตั้งเป็นแอปบนมือถือได้ (PWA)', S['b']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>ฟีเจอร์หลัก:</b>', S['h2']))
    features = [
        ['สำหรับพนักงาน', 'เปิด Ticket, แนบรูป/ไฟล์, ดูสถานะ, รับแจ้งเตือน, คุยกับ AI Chatbot'],
        ['สำหรับทีม IT', 'ดู/แก้ไข Ticket ทุกคน, มอบหมายงาน, ใส่วิธีแก้, ดูประวัติ, อนุมัติผู้ลงทะเบียน'],
        ['AI Chatbot', 'ตอบปัญหา IT เบื้องต้น 24/7, เปิด Ticket อัตโนมัติ, เรียนรู้จากข้อมูลจริง'],
        ['Knowledge Base', 'คู่มือ IT + ประสบการณ์จาก Ticket เก่า (367+ entries), ยิ่งใช้ยิ่งฉลาด'],
        ['Notification', 'แจ้งเตือน Admin เมื่อ Ticket ใหม่, แจ้งเตือน User เมื่อสถานะเปลี่ยน'],
        ['FAQ', 'คำถามที่พบบ่อยจากคู่มือ IT (อัพเดทอัตโนมัติ)'],
        ['PWA', 'ติดตั้งบนมือถือเป็นแอปได้ทั้ง Android + iOS'],
    ]
    story.append(tbl(['ด้าน', 'รายละเอียด'], features, [W_*0.25, W_*0.75]))

    story.append(PageBreak())

    # ======================== 2. วิธีใช้งาน User ========================
    story.append(Paragraph('2. วิธีใช้งาน — สำหรับพนักงาน (User)', S['h1']))
    story.append(hr())

    story.append(Paragraph('<b>2.1 การ Login</b>', S['h2']))
    steps = [
        'เปิด Browser ไปที่ https://project-code-gamma.vercel.app',
        'กรอกรหัสพนักงาน + รหัสผ่าน (default = รหัสพนักงาน)',
        'กด "เข้าสู่ระบบ"',
        'ถ้ายังไม่มีบัญชี กด "ลงทะเบียนที่นี่" แล้วรอ Admin อนุมัติ',
    ]
    for i, s in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {s}', S['bl']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>2.2 การเปิด Ticket</b>', S['h2']))
    steps2 = [
        'คลิก "เปิด Ticket" ที่ navbar ด้านบน',
        'เลือก บริษัท/สถานที่, ประเภทงาน, ประเภทปัญหา, อาการ (dropdown cascading)',
        'เลือก โลเคชั่นที่พบปัญหา (Comets HQ / Comets FAC / ICT / JA / บ้านแสง)',
        'กรอก รายละเอียดคำขอ (บอกปัญหาให้ละเอียด)',
        'แนบรูปถ้ามี (สูงสุด 5 รูป x 5 MB) เช่น screenshot หน้าจอ error',
        'แนบไฟล์เอกสารถ้ามี (สูงสุด 5 ไฟล์ x 10 MB) เช่น PDF, Word, Excel',
        'กด "ส่ง Ticket" -- ระบบจะสร้างเลข Ticket ให้อัตโนมัติ (เช่น IT2604-001)',
    ]
    for i, s in enumerate(steps2, 1):
        story.append(Paragraph(f'{i}. {s}', S['bl']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>2.3 การดูสถานะ Ticket</b>', S['h2']))
    story.append(Paragraph('คลิก "Ticket List" ที่ navbar -- จะเห็นรายการ Ticket ของตัวเองพร้อมสถานะปัจจุบัน สามารถ filter ตามสถานะ และค้นหาได้', S['b']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>2.4 สถานะ Ticket มี 5 ประเภท:</b>', S['h2']))
    statuses = [
        ['เปิด Ticket', 'เพิ่งส่ง ยังไม่มีคนรับ', 'เหลือง'],
        ['กำลังดำเนินการ', 'IT กำลังแก้ไข', 'น้ำเงิน'],
        ['ต้องการ Approve', 'รอผู้บริหารอนุมัติ', 'ส้ม'],
        ['ดำเนินการเรียบร้อย', 'แก้ไขเสร็จแล้ว', 'เขียว'],
        ['ยกเลิก', 'ยกเลิก Ticket', 'เทา'],
    ]
    story.append(tbl(['สถานะ', 'ความหมาย', 'สี Badge'], statuses, [W_*0.3, W_*0.5, W_*0.2]))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>2.5 การรับแจ้งเตือน</b>', S['h2']))
    story.append(Paragraph('เมื่อ Admin แก้ไข Ticket ของคุณ (เปลี่ยนสถานะ/ใส่วิธีแก้/มอบหมายผู้รับผิดชอบ) ระบบจะแจ้งเตือนอัตโนมัติ -- คลิกไอคอนกระดิ่ง ที่ navbar จะเห็นรายการแจ้งเตือน', S['b']))

    story.append(PageBreak())

    # ======================== 3. วิธีใช้งาน Admin ========================
    story.append(Paragraph('3. วิธีใช้งาน — สำหรับทีม IT (Admin)', S['h1']))
    story.append(hr())

    story.append(Paragraph('<b>3.1 การ Login เป็น Admin</b>', S['h2']))
    story.append(Paragraph('Login เหมือน User ปกติ ระบบจะตรวจสอบว่า is_admin = true ใน DB อัตโนมัติ Admin จะเห็นฟีเจอร์เพิ่มเติม: ปุ่มแก้ไข Ticket, tab อนุมัติ, กระดิ่งแจ้ง Ticket ใหม่', S['b']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>3.2 การแก้ไข Ticket</b>', S['h2']))
    steps3 = [
        'ไป Ticket List -- Admin จะเห็น Ticket ของทุกคน (User เห็นเฉพาะของตัวเอง)',
        'คลิกปุ่มดินสอเขียว (แก้ไข) ที่แต่ละแถว',
        'Modal จะเปิดขึ้น พร้อมข้อมูลสรุป Ticket',
        'เลือก ผู้รับผิดชอบ จาก dropdown (รายชื่อ IT ที่ is_admin = true)',
        'เปลี่ยน สถานะ ตามความเหมาะสม',
        'ใส่ วิธีแก้ไขปัญหา (ข้อมูลนี้จะถูกเรียนรู้อัตโนมัติโดย AI)',
        'กด บันทึก -- ระบบจะ: บันทึกประวัติการแก้ไข + แจ้งเตือน User + เพิ่มเข้า Knowledge Base (ถ้า status = เสร็จ)',
    ]
    for i, s in enumerate(steps3, 1):
        story.append(Paragraph(f'{i}. {s}', S['bl']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>3.3 กระดิ่งแจ้งเตือน</b>', S['h2']))
    story.append(Paragraph('ไอคอนกระดิ่งที่ navbar จะแสดง badge สีแดงจำนวน Ticket ที่ "เปิด Ticket" + ยังไม่มีคนรับ เมื่อมี Ticket ใหม่จะมี popup เด้งขึ้นมา + เสียง beep อัตโนมัติทุก 30 วินาที', S['b']))

    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>3.4 IT Staff ปัจจุบัน</b>', S['h2']))
    admins = [
        ['Admin', 'Admin', 'Active'],
        ['IT03', 'วี', 'Active'],
        ['IT07', 'ปุ๊ก', 'Active'],
        ['IT08', 'แชมป์', 'Active'],
        ['IT09', 'ยาม้าล', 'Active'],
    ]
    story.append(tbl(['รหัส', 'ชื่อเล่น', 'สถานะ'], admins, [W_*0.2, W_*0.4, W_*0.4]))

    story.append(PageBreak())

    # ======================== 4. AI Chatbot ========================
    story.append(Paragraph('4. AI Chatbot (IT Support)', S['h1']))
    story.append(hr())

    story.append(Paragraph('ปุ่มแชทมุมขวาล่างของหน้าจอ เปิดคุยกับ AI ได้ตลอด 24 ชม.', S['b']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>4.1 การทำงาน</b>', S['h2']))
    chat_flow = [
        ['User พิมพ์ปัญหา', 'ระบบค้น Knowledge Base (367 entries) + ส่งให้ AI ตอบ'],
        ['ปัญหาทั่วไป (คอมค้าง, เมลเต็ม)', 'Bot แนะนำวิธีแก้เบื้องต้น, ถาม "หายไหม?"'],
        ['ขอสิทธิ์/อนุมัติ', 'Bot เปิด Ticket ให้ทันที (user แก้เองไม่ได้)'],
        ['User บอก "ไม่หาย"', 'Bot เปิดฟอร์ม Ticket ให้กรอก (pre-fill รายละเอียด)'],
        ['Bot ไม่รู้คำตอบ', 'บอกตรงๆ ว่าไม่มีข้อมูล แนะนำเปิด Ticket (ไม่แต่งคำตอบมั่ว)'],
    ]
    story.append(tbl(['สถานการณ์', 'Bot ทำอะไร'], chat_flow, [W_*0.35, W_*0.65]))

    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>4.2 ระบบเรียนรู้อัตโนมัติ</b>', S['h2']))
    story.append(Paragraph('เมื่อ Admin แก้ Ticket เสร็จ + ใส่วิธีแก้ + เปลี่ยนสถานะเป็น "เสร็จ" ระบบจะเพิ่มข้อมูลเข้า Knowledge Base อัตโนมัติ ครั้งหน้าคนอื่นถามเรื่องเดียวกัน Bot จะตอบได้ทันที', S['b']))

    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>4.3 ข้อมูลที่ Bot ใช้ตอบ</b>', S['h2']))
    kb = [
        ['คู่มือ IT', '29 entries', 'Backup อีเมล, ลบวิดเจ็ต, แก้ password, คอมเบื้องต้น'],
        ['Ticket เก่า', '333 entries', 'วิธีแก้จากประสบการณ์ทีม IT จริง'],
        ['Auto-learn', 'เพิ่มขึ้นเรื่อยๆ', 'จาก Ticket ที่ปิดใหม่ทุกวัน'],
    ]
    story.append(tbl(['แหล่ง', 'จำนวน', 'ตัวอย่าง'], kb, [W_*0.2, W_*0.2, W_*0.6]))

    story.append(PageBreak())

    # ======================== 5. ลงทะเบียน ========================
    story.append(Paragraph('5. ระบบลงทะเบียน + อนุมัติ', S['h1']))
    story.append(hr())

    story.append(Paragraph('<b>สำหรับพนักงานใหม่:</b>', S['h2']))
    story.append(Paragraph('หน้า Login กด "ลงทะเบียนที่นี่" กรอกข้อมูล: รหัสพนักงาน, Password, สังกัด (Comets/ICT/JA), ชื่อ, นามสกุล, ชื่อเล่น, ตำแหน่ง, อีเมล, เบอร์โทร แล้วรอ Admin อนุมัติ', S['b']))

    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>สำหรับ Admin:</b>', S['h2']))
    story.append(Paragraph('Tab "อนุมัติ" ใน navbar แสดงรายชื่อผู้ลงทะเบียนใหม่ กดอนุมัติ (ถูก) หรือปฏิเสธ (กากบาท) ได้ มี badge สีแดงแสดงจำนวนคนรอ', S['b']))

    # ======================== 6. FAQ ========================
    story.append(Spacer(1, 12))
    story.append(Paragraph('6. FAQ (คำถามที่พบบ่อย)', S['h1']))
    story.append(hr())
    story.append(Paragraph('Tab "FAQ" แสดงคู่มือ IT ที่เขียนโดยทีม IT จัดเป็นหมวดหมู่ คลิกเปิด-ปิดได้ ค้นหาได้ ข้อมูลมาจากไฟล์คู่มือที่วางใน folder โปรเจกต์ อัพเดทโดยรัน python build_knowledge.py', S['b']))

    story.append(PageBreak())

    # ======================== 7. สถาปัตยกรรม ========================
    story.append(Paragraph('7. สถาปัตยกรรมระบบ', S['h1']))
    story.append(hr())

    arch = [
        ['Frontend (หน้าเว็บ)', 'HTML/CSS/JavaScript', 'Vercel', 'ฟรี'],
        ['Database', 'PostgreSQL', 'Supabase', 'ฟรี (500 MB)'],
        ['File Storage', 'Supabase Storage', 'Supabase', 'ฟรี (1 GB)'],
        ['AI Chatbot', 'Llama 3.3 70B', 'Groq', 'ฟรี (6,000 req/วัน)'],
        ['Knowledge Base', 'Full-text Search', 'Supabase', 'ฟรี'],
        ['Serverless API', 'Node.js', 'Vercel Functions', 'ฟรี (100K/เดือน)'],
        ['PWA', 'Service Worker', 'Browser', 'ฟรี'],
    ]
    story.append(tbl(['Component', 'เทคโนโลยี', 'Host', 'ค่าใช้จ่าย'], arch, [W_*0.22, W_*0.25, W_*0.25, W_*0.28]))

    # ======================== 8. ข้อมูลปัจจุบัน ========================
    story.append(Spacer(1, 12))
    story.append(Paragraph('8. ข้อมูลในระบบปัจจุบัน', S['h1']))
    story.append(hr())

    data_stats = [
        ['พนักงาน (employees)', '3,296 คน', '802 Active / 2,494 ลาออก (login ไม่ได้)'],
        ['IT Admin (is_admin=true)', '5 คน', 'Admin, IT03, IT07, IT08, IT09'],
        ['Ticket', '1,692 รายการ', 'จาก Excel + ticket ใหม่'],
        ['Worklist (dropdown)', '176 ตัวเลือก', 'Job Type, Issue Type, อาการ'],
        ['Knowledge Base', '367 entries', '333 จาก ticket + 29 จากคู่มือ + 5 จาก text'],
        ['Plants (สังกัด)', '4 แห่ง', 'Comets, ICT, JA, Admin'],
        ['โลเคชั่น', '5 แห่ง', 'Comets HQ, Comets FAC, ICT, JA, บ้านแสง'],
    ]
    story.append(tbl(['ข้อมูล', 'จำนวน', 'หมายเหตุ'], data_stats, [W_*0.25, W_*0.2, W_*0.55]))

    story.append(PageBreak())

    # ======================== 9. ข้อจำกัด ========================
    story.append(Paragraph('9. ข้อจำกัดทั้งหมด', S['h1']))
    story.append(hr())

    story.append(Paragraph('<b>9.1 ข้อจำกัดด้านความปลอดภัย</b>', S['h2']))
    sec = [
        ['Password เก็บเป็น Plaintext', 'รหัสผ่านใน DB ไม่ได้ hash', 'สูง', 'ควร hash ด้วย bcrypt'],
        ['Password ใน sessionStorage', 'browser เก็บ password ตลอด session', 'สูง', 'ควรใช้ JWT token แทน'],
        ['ไม่มี Session Timeout', 'login แล้วไม่มีวัน expire', 'สูง', 'ควรเพิ่ม timeout 30 นาที'],
        ['Chat API ไม่มี auth', 'ใครก็เรียก /api/chat ได้', 'กลาง', 'เพิ่ม token verification'],
        ['CORS เปิด *', 'ทุก origin เรียก API ได้', 'กลาง', 'จำกัดเฉพาะ domain เรา'],
        ['AI ส่งข้อมูลออก cloud', 'ข้อความถูกส่งไป Groq', 'กลาง', 'มี safety filter redact ข้อมูลละเอียดอ่อน'],
        ['File upload ไม่ validate server', 'เช็คแค่ฝั่ง browser', 'กลาง', 'เพิ่ม server-side validation'],
        ['Supabase anon key ใน HTML', 'ใครก็เห็น key ได้', 'ต่ำ', 'ปลอดภัยด้วย RLS + RPC (ออกแบบมาให้เป็นแบบนี้)'],
    ]
    story.append(tbl(['ข้อจำกัด', 'รายละเอียด', 'ความเสี่ยง', 'แนวทางแก้ไข'], sec, [W_*0.22, W_*0.28, W_*0.12, W_*0.38]))

    story.append(Spacer(1, 10))
    story.append(Paragraph('<b>9.2 ข้อจำกัดด้านฟังก์ชัน</b>', S['h2']))
    func = [
        ['ไม่มี Dashboard สถิติ', 'ไม่มีกราฟ/chart สรุปภาพรวม'],
        ['ไม่มี SLA Tracking', 'ไม่นับเวลา response/resolution'],
        ['ไม่มี Comment ใน Ticket', 'Admin กับ User คุยกันใน Ticket ไม่ได้'],
        ['User แก้ไข Ticket ไม่ได้', 'ส่งแล้วแก้ไขไม่ได้ ต้องเปิดใหม่'],
        ['ไม่มี Email notification', 'แจ้งเตือนแค่ในเว็บ ไม่ส่ง Email'],
        ['ไม่มี LINE notification', 'ไม่เชื่อมกับ LINE'],
        ['ไม่มีให้คะแนนความพอใจ', 'ไม่มี feedback loop'],
        ['ไม่มี Export จากเว็บ', 'ต้องรัน script ไม่มีปุ่ม export ในเว็บ'],
        ['Chatbot อาจตอบไม่ตรง', 'ถ้า knowledge base ไม่มี Bot จะบอกว่าไม่รู้ (ไม่แต่งมั่ว)'],
        ['PDF รูปภาพอ่านไม่ได้', 'Bot อ่านคู่มือที่เป็น screenshot ไม่ได้ ต้องพิมพ์เป็น text'],
    ]
    story.append(tbl(['ข้อจำกัด', 'รายละเอียด'], func, [W_*0.3, W_*0.7]))

    story.append(Spacer(1, 10))
    story.append(Paragraph('<b>9.3 ข้อจำกัดด้าน Free Tier</b>', S['h2']))
    limits = [
        ['Supabase DB', '500 MB', 'ใช้ ~50 MB รองรับ ticket อีก ~50,000 รายการ', 'ต่ำ'],
        ['Supabase Storage', '1 GB', 'รูป + เอกสารแนบ', 'กลาง (ถ้าแนบเยอะ)'],
        ['Groq AI', '6,000 req/วัน', '~3,000 คำถาม/วัน (เกินพอ)', 'ต่ำ'],
        ['Vercel Bandwidth', '100 GB/เดือน', '~2 ล้าน pageview', 'ต่ำ'],
        ['Vercel Functions', '100K/เดือน', 'เรียก chat API', 'ต่ำ'],
    ]
    story.append(tbl(['บริการ', 'ขีดจำกัด', 'ผลกระทบ', 'ความเสี่ยง'], limits, [W_*0.18, W_*0.18, W_*0.44, W_*0.2]))

    story.append(PageBreak())

    # ======================== 10. ค่าใช้จ่าย ========================
    story.append(Paragraph('10. ค่าใช้จ่าย', S['h1']))
    story.append(hr())

    story.append(Paragraph('<b>ปัจจุบัน: ฿0/เดือน (Free Tier ทั้งหมด)</b>', S['h2']))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>เปรียบเทียบกับระบบอื่น:</b>', S['h2']))
    compare = [
        ['IT Ticket System (ของเรา)', '฿0', '฿0 - ฿3,400', 'ปรับแต่งได้ 100%'],
        ['Jira Service Management', '฿0 (3 agents)', '~฿6,000/เดือน', 'ซับซ้อน'],
        ['Freshdesk', '฿0 (10 agents)', '~฿4,500/เดือน', 'ภาษาไทยจำกัด'],
        ['ServiceNow', 'ไม่มี Free', '~฿50,000+/เดือน', 'Enterprise'],
    ]
    story.append(tbl(['ระบบ', 'ค่าเริ่มต้น', 'ค่าใช้จ่ายจริง', 'หมายเหตุ'], compare, [W_*0.28, W_*0.18, W_*0.27, W_*0.27]))

    # ======================== 11. Roadmap ========================
    story.append(Spacer(1, 12))
    story.append(Paragraph('11. แผนพัฒนาต่อ (Roadmap)', S['h1']))
    story.append(hr())

    roadmap = [
        ['Phase 1-9 (เสร็จแล้ว)', 'Ticket + Admin + AI Chatbot + Registration + Notification + FAQ'],
        ['Phase 10 (วางแผน)', 'Dashboard สถิติ (กราฟ ticket ตามสถานะ/แผนก/เดือน)'],
        ['Phase 11 (วางแผน)', 'Hash Password + Session Timeout (ความปลอดภัย)'],
        ['Phase 12 (วางแผน)', 'Comment ใน Ticket (Admin-User คุยกัน)'],
        ['Phase 13 (วางแผน)', 'LINE Messaging API (แจ้งเตือนผ่าน LINE)'],
        ['Phase 14 (วางแผน)', 'SLA Tracking + ให้คะแนนความพอใจ'],
        ['Phase 15 (วางแผน)', 'Export CSV/Excel จากในเว็บ'],
    ]
    story.append(tbl(['Phase', 'รายละเอียด'], roadmap, [W_*0.25, W_*0.75]))

    story.append(PageBreak())

    # ======================== 12. ข้อเสนอแนะ ========================
    story.append(Paragraph('12. ข้อเสนอแนะ', S['h1']))
    story.append(hr())

    recs = [
        'อนุมัติให้ใช้งานระบบ IT Ticket System เป็นช่องทางหลักในการแจ้งปัญหา IT',
        'กำหนดนโยบาย: ทุกปัญหา IT ต้องผ่านการเปิด Ticket (ไม่รับงานที่ไม่มี Ticket)',
        'มอบหมายทีม IT ดูแลระบบ + เพิ่มคู่มือลง Knowledge Base อย่างต่อเนื่อง',
        'จัดอบรมพนักงานเรื่องการใช้ระบบ + วิธีคุยกับ AI Chatbot',
        'ดำเนินการแก้ไขข้อจำกัดด้านความปลอดภัย (Hash Password, Session Timeout) ก่อนเปิดใช้จริง',
        'วางแผน Phase 10-15 ตาม Roadmap',
    ]
    for i, r in enumerate(recs, 1):
        story.append(Paragraph(f'{i}. {r}', S['bl']))

    story.append(Spacer(1, 40))
    story.append(hr())

    # Signature
    sig2 = ParagraphStyle('S2', fontName='Thai', fontSize=11, textColor=C2, leading=16)
    sigdata = [
        [P('ผู้จัดทำ: ______________________', sig2), P('ผู้อนุมัติ: ______________________', sig2)],
        [P('ตำแหน่ง: ______________________', sig2), P('ตำแหน่ง: ______________________', sig2)],
        [P('วันที่:   ______________________', sig2), P('วันที่:   ______________________', sig2)],
    ]
    st = Table(sigdata, colWidths=[W_*0.5, W_*0.5])
    st.setStyle(TableStyle([('TOPPADDING', (0,0),(-1,-1), 12)]))
    story.append(st)

    doc.build(story)
    print(f'PDF created: {fn}')


if __name__ == '__main__':
    build()
