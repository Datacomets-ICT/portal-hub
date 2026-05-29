"""
Generate IT Ticket System Infographic — Quick Reference Card
Visual guide showing what each field/button does.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image as RLImage
)
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, re

pdfmetrics.registerFont(TTFont('Thai', r'C:\Windows\Fonts\LEELAWAD.TTF'))
pdfmetrics.registerFont(TTFont('Sym', r'C:\Windows\Fonts\seguisym.ttf'))

_EMOJI_RE = re.compile(r'([\U0001F300-\U0001FAFF\U00002600-\U000027BF])')
_BaseParagraph = Paragraph
def Paragraph(text, *a, **kw):
    return _BaseParagraph(_EMOJI_RE.sub(r'<font name="Sym">\1</font>', str(text)), *a, **kw)

# Colors
C = {
    'primary':   HexColor('#4F46E5'),
    'primary_l': HexColor('#EEF2FF'),
    'dark':      HexColor('#0F172A'),
    'gray':      HexColor('#475569'),
    'muted':     HexColor('#94A3B8'),
    'light':     HexColor('#F8FAFC'),
    'success':   HexColor('#10B981'),
    'warn':      HexColor('#F59E0B'),
    'danger':    HexColor('#EF4444'),
    'orange':    HexColor('#F97316'),
    'sky':       HexColor('#0EA5E9'),
    'white':     white,
}

# Styles
S = lambda name, **kw: ParagraphStyle(name, fontName='Thai', **kw)
st = {
    'title':     S('T', fontSize=26, textColor=C['primary'], leading=34, alignment=1),
    'subtitle':  S('ST', fontSize=12, textColor=C['gray'], leading=16, alignment=1),
    'h1':        S('H1', fontSize=18, textColor=C['primary'], leading=24, spaceBefore=10, spaceAfter=6),
    'h2':        S('H2', fontSize=14, textColor=C['dark'], leading=20, spaceBefore=8, spaceAfter=4),
    'body':      S('B', fontSize=10, textColor=C['dark'], leading=15),
    'body_s':    S('BS', fontSize=9, textColor=C['gray'], leading=13),
    'num':       S('N', fontSize=16, textColor=C['white'], leading=20, alignment=1),
    'label':     S('L', fontSize=9, textColor=C['dark'], leading=13),
    'label_b':   S('LB', fontSize=9, textColor=C['dark'], leading=13),
    'footer':    S('F', fontSize=8, textColor=C['muted'], leading=10, alignment=1),
}
cell_s = S('CS', fontSize=9, textColor=C['dark'], leading=12)
cell_h = S('CH', fontSize=9, textColor=C['white'], leading=12)

IMG_DIR = os.path.join(os.path.dirname(__file__), 'manual_images')
W = A4[0] - 3*cm


def P(t, s=None):
    return Paragraph(str(t).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'), s or cell_s)


def section_card(title, color, items):
    """Numbered card list with colored header."""
    rows = [[Paragraph(f'<b>{title}</b>', S('SH', fontSize=12, textColor=C['white'], leading=16))]]
    for i, (label, desc) in enumerate(items, 1):
        circle = Table([[Paragraph(f'<b>{i}</b>', S('CN', fontSize=10, textColor=C['white'], leading=14, alignment=1))]],
                       colWidths=[20], rowHeights=[20])
        circle.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), color),
            ('ROUNDEDCORNERS', [10,10,10,10]),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ]))
        text = Paragraph(f'<b>{label}</b><br/><font size="8" color="#{C["gray"].hexval()[2:]}">{desc}</font>',
                         S(f'IT{i}', fontSize=9, textColor=C['dark'], leading=13))
        rows.append([Table([[circle, text]], colWidths=[28, None],
                           style=TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(1,0),(1,0),6)]))])

    t = Table(rows, colWidths=[None])
    header_style = [
        ('BACKGROUND', (0,0), (-1,0), color),
        ('TOPPADDING', (0,0), (-1,0), 10),
        ('BOTTOMPADDING', (0,0), (-1,0), 10),
        ('LEFTPADDING', (0,0), (-1,0), 14),
        ('TOPPADDING', (0,1), (-1,-1), 6),
        ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ('LEFTPADDING', (0,1), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [8,8,8,8]),
        ('BOX', (0,0), (-1,-1), 0.5, HexColor('#E2E8F0')),
    ]
    t.setStyle(TableStyle(header_style))
    return t


def status_flow():
    """Visual status flow diagram as a table."""
    def badge(text, bg, fg):
        return Paragraph(f'<font color="#{fg[2:]}" size="9"><b>{text}</b></font>',
                         S('Badge', fontSize=9, textColor=HexColor(fg), leading=12, alignment=1))
    def arrow():
        return Paragraph('→', S('Arrow', fontSize=14, textColor=C['muted'], leading=16, alignment=1))

    flow = Table([
        [badge('เปิด Ticket','#FEF3C7','#92400E'), arrow(),
         badge('กำลังดำเนินการ','#DBEAFE','#1E40AF'), arrow(),
         badge('ดำเนินการเรียบร้อย','#D1FAE5','#065F46'), arrow(),
         badge('ปิดงานแล้ว','#DCFCE7','#14532D')],
    ], colWidths=[W*0.22, 20, W*0.22, 20, W*0.22, 20, W*0.22])
    flow.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    return flow


def priority_table():
    rows = [
        [P('<b>Priority</b>', cell_h), P('<b>SLA</b>', cell_h), P('<b>ใช้เมื่อ</b>', cell_h)],
        [P('🔴 ด่วนมาก'), P('2 ชม.'), P('งานหยุด / CEO / ปิดบัญชี')],
        [P('🟠 สำคัญ'),   P('4 ชม.'), P('ทำงานไม่ได้ ต้องเสร็จวันนี้')],
        [P('🟡 ปกติ'),     P('8 ชม.'), P('มีปัญหาแต่ทำอื่นได้ (default)')],
        [P('🟢 ไม่เร่ง'),  P('24 ชม.'), P('ขอเสริม / ไม่เร่ง')],
    ]
    t = Table(rows, colWidths=[W*0.25, W*0.15, W*0.60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C['primary']),
        ('TEXTCOLOR', (0,0), (-1,0), C['white']),
        ('BACKGROUND', (0,1), (-1,-1), C['light']),
        ('BOX', (0,0), (-1,-1), 0.5, HexColor('#E2E8F0')),
        ('LINEBELOW', (0,0), (-1,-2), 0.3, HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    return t


def sidebar_guide():
    rows = [
        [P('<b>ปุ่ม</b>', cell_h), P('<b>สี</b>', cell_h), P('<b>ทำอะไร</b>', cell_h)],
        [P('🤖 AI Support'),  P('ม่วง'), P('เปิด AI Chatbot สอบถามปัญหา IT')],
        [P('💬 แชท Ticket'),  P('เขียว'), P('แชทกับ IT ใน Ticket + ดูข้อมูลติดต่อ')],
        [P('📖 คู่มือ'),       P('ฟ้า'),  P('เปิดคู่มือ PDF')],
    ]
    t = Table(rows, colWidths=[W*0.25, W*0.12, W*0.63])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C['success']),
        ('BACKGROUND', (0,1), (-1,-1), C['light']),
        ('BOX', (0,0), (-1,-1), 0.5, HexColor('#E2E8F0')),
        ('LINEBELOW', (0,0), (-1,-2), 0.3, HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    return t


def add_img(story, filename, caption=None, width_ratio=0.75):
    path = os.path.join(IMG_DIR, filename)
    if not os.path.exists(path): return
    iw, ih = ImageReader(path).getSize()
    tw = W * width_ratio
    th = tw * (ih / iw)
    if th > 9*cm: th = 9*cm; tw = th * (iw/ih)
    im = RLImage(path, width=tw, height=th)
    im.hAlign = 'CENTER'
    story.append(im)
    if caption:
        cap = S('Cap', fontSize=8, textColor=C['muted'], leading=10, alignment=1)
        story.append(Spacer(1,2))
        story.append(Paragraph(caption, cap))
    story.append(Spacer(1,8))


def build():
    fn = os.path.join(os.path.dirname(__file__), 'infographic.pdf')
    doc = SimpleDocTemplate(fn, pagesize=A4,
                            leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=1.5*cm)
    story = []

    # ===== PAGE 1: USER GUIDE =====
    story.append(Paragraph('📋 IT Ticket System', st['title']))
    story.append(Paragraph('Quick Reference Card — คู่มือฉบับย่อ', st['subtitle']))
    story.append(Spacer(1, 8))
    story.append(Paragraph('https://project-code-gamma.vercel.app', st['footer']))
    story.append(Spacer(1, 12))

    # -- Ticket Form --
    story.append(section_card('📝 การเปิด Ticket', C['primary'], [
        ('บริษัท / สถานที่',       'เลือกว่าปัญหาอยู่ที่ Comets HQ, FAC, ICT, JA, หรือบ้านแสง'),
        ('ประเภทงาน (Job Type)',   'หมวดหมู่ปัญหา: คอมพิวเตอร์, ปริ้นเตอร์, Email, ขอสิทธิ์, ฯลฯ'),
        ('ประเภทปัญหา + อาการ',    'เลือกจาก dropdown — ระบบจะเสนอให้ตามประเภทงานที่เลือก'),
        ('โลเคชั่น + โซน',         'ระบุตำแหน่งที่พบปัญหา เช่น "ชั้น 2 ห้อง IT โต๊ะมุมซ้าย"'),
        ('ระดับความเร่งด่วน',       '🔴 ด่วนมาก (2 ชม.) · 🟠 สำคัญ (4 ชม.) · 🟡 ปกติ (8 ชม.) · 🟢 ไม่เร่ง (24 ชม.)'),
        ('รายละเอียดคำขอ',         'บอกอาการให้ละเอียด — ยิ่งละเอียดยิ่งแก้เร็ว'),
        ('แนบรูป / ไฟล์',          'รูปสูงสุด 5 ภาพ (5 MB) + ไฟล์ 5 ไฟล์ (10 MB) · มี progress bar + retry อัตโนมัติ'),
    ]))
    story.append(Spacer(1, 8))
    add_img(story, '03_new_ticket.png', 'ฟอร์มเปิด Ticket ใหม่')

    story.append(PageBreak())

    # -- Ticket List --
    story.append(section_card('📊 หน้ารายการ Ticket', C['sky'], [
        ('Summary Cards (ด้านบน)',     'จำนวน Ticket แบ่งตามสถานะ: ทั้งหมด / เปิด / กำลังดำเนินการ / เสร็จ / ยกเลิก'),
        ('Filter Tabs',               'กด Tab เพื่อกรอง เช่น เปิด Ticket, กำลังดำเนินการ, รอยืนยัน, ปิดงานแล้ว'),
        ('ช่องค้นหา',                  'ค้นได้จาก: เลข Ticket, ชื่อผู้แจ้ง, ประเภทงาน, อาการ, ผู้รับผิดชอบ, VNC'),
        ('คอลัมน์ Priority',           'Badge สี 🔴🟠🟡🟢 — เรียง ด่วนมาก มาก่อนอัตโนมัติ'),
        ('คอลัมน์ SLA',                'เวลาที่เหลือก่อนครบกำหนด (นับเฉพาะ จ-ศ 08:00–17:00) สีเขียว/เหลือง/แดง'),
        ('ปุ่ม 👁 ดู',                  'เปิด Modal ดูรายละเอียด Ticket ทั้งหมด + รูปแนบ + แชทกับ IT'),
        ('ปุ่ม ✓ ยืนยันปิดงาน',        'กดเมื่อ IT แก้เสร็จแล้ว → สถานะเป็น "ปิดงานแล้ว" (ถ้าไม่กด 7 วัน ระบบปิดอัตโนมัติ)'),
        ('ปุ่ม ↺ เปิดใหม่',            'ถ้าปัญหากลับมา → ใส่เหตุผล → IT ได้รับแจ้ง → Ticket กลับเป็น "เปิด Ticket"'),
        ('ปุ่ม โหลดเพิ่ม (ด้านล่าง)',    'ระบบโหลด 100 ตัวแรก ถ้าอยากดูเก่ากว่ากดโหลดเพิ่มได้'),
    ]))
    story.append(Spacer(1, 6))
    add_img(story, '04_ticket_list.png', 'หน้ารายการ Ticket พร้อม Priority + SLA')

    story.append(PageBreak())

    # -- Sidebar + Chat + Notification --
    story.append(Paragraph('🔧 เครื่องมือด้านข้างและการแจ้งเตือน', st['h1']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>ปุ่มด้านซ้าย (Sidebar)</b>', st['h2']))
    story.append(sidebar_guide())
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>🔔 การแจ้งเตือน (กระดิ่งมุมขวาบน)</b>', st['h2']))
    story.append(Paragraph('• Badge สีแดง = จำนวนการแจ้งเตือนใหม่ · กดเพื่อดูรายละเอียด · กด "อ่านทั้งหมด" เพื่อ clear', st['body_s']))
    story.append(Paragraph('• ปิดเสียง/popup ได้ที่ โปรไฟล์ → แท็บ "แจ้งเตือน"', st['body_s']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>⋮ เมนู 3 จุด (มุมขวาบน)</b>', st['h2']))
    story.append(Paragraph('• <b>โปรไฟล์ของฉัน</b> — แก้ชื่อเล่น/เบอร์/email, เปลี่ยน password, อัปโหลดรูป avatar, ตั้งธีม (Light/Dark), ขนาดตัวอักษร, ปิดเสียงแจ้งเตือน', st['body_s']))
    story.append(Paragraph('• <b>ออกจากระบบ</b> — logout', st['body_s']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>📞 Contact Popup (ข้อมูลติดต่อด่วน)</b>', st['h2']))
    story.append(Paragraph('ในรายการแชท Ticket ทางซ้าย → คลิก avatar ของ Ticket → เด้ง popup แสดงเบอร์โทร + email ของอีกฝ่าย · กดเพื่อโทร/เมลได้ทันที', st['body_s']))
    story.append(Spacer(1, 6))
    add_img(story, '17_contact_popup.png', 'Contact Popup — โทร/อีเมลอีกฝ่ายได้ทันที', width_ratio=0.55)

    story.append(PageBreak())

    # ===== PAGE 4: STATUS FLOW + PRIORITY =====
    story.append(Paragraph('🔄 Flow สถานะ Ticket', st['h1']))
    story.append(Spacer(1, 8))
    story.append(status_flow())
    story.append(Spacer(1, 6))
    story.append(Paragraph('• <b>Admin</b> เปลี่ยนได้: เปิด → กำลังดำเนินการ → ดำเนินการเรียบร้อย', st['body_s']))
    story.append(Paragraph('• <b>User</b> เปลี่ยนได้: ดำเนินการเรียบร้อย → <b>ปิดงานแล้ว</b> (ยืนยัน) หรือ กลับไป <b>เปิด Ticket</b> (เปิดใหม่)', st['body_s']))
    story.append(Paragraph('• <b>ระบบ</b> ปิดอัตโนมัติหลัง 7 วัน ถ้า User ไม่ยืนยัน', st['body_s']))
    story.append(Spacer(1, 14))

    story.append(Paragraph('⏰ Priority × SLA (เวลาทำงาน จ–ศ 08:00–17:00)', st['h1']))
    story.append(Spacer(1, 6))
    story.append(priority_table())
    story.append(Spacer(1, 12))

    # -- AI Chatbot guide --
    story.append(Paragraph('🤖 AI Chatbot — ใช้งานยังไง?', st['h1']))
    story.append(Spacer(1, 6))
    story.append(section_card('วิธีใช้ AI IT Support', C['orange'], [
        ('กดปุ่มม่วง 🤖 ด้านซ้าย',        'เปิดกล่องแชท AI'),
        ('พิมพ์ปัญหาที่พบ',               'เช่น "คอมค้าง" "อยากลง VS Code" "เมลเต็ม"'),
        ('AI ตอบทันที 24 ชม.',            'แนะนำวิธีแก้ พร้อมลิงก์ดาวน์โหลดจากเว็บทางการ'),
        ('ถ้าแก้ไม่ได้ → AI เปิด Ticket', 'พิมพ์ "ทำไม่ได้" หรือ "ช่วยด้วย" → AI สร้าง Ticket ให้อัตโนมัติ'),
        ('ปัญหาปริ้นเตอร์/เครือข่าย',     'AI ส่งให้ IT ทันทีเลย (เรื่องนี้ IT ต้องจัดการเอง)'),
    ]))
    story.append(Spacer(1, 6))
    add_img(story, '09_ai_chatbot.png', 'กล่องแชท AI IT Support', width_ratio=0.50)

    story.append(Spacer(1, 20))
    story.append(Paragraph('IT Ticket System v3.0 · Comets Intertrade · https://project-code-gamma.vercel.app', st['footer']))

    doc.build(story)
    print(f'Infographic created: {fn}')


if __name__ == '__main__':
    build()
