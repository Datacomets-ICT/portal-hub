"""
Generate IT Ticket System User Manual PDF
คู่มือการใช้งาน — แยกเป็นสำหรับ User และ Admin
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Image as RLImage
)
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
import os

pdfmetrics.registerFont(TTFont('Thai', r'C:\Windows\Fonts\LEELAWAD.TTF'))
pdfmetrics.registerFont(TTFont('Sym', r'C:\Windows\Fonts\seguisym.ttf'))

# Wrap Paragraph so emoji chars auto-fallback to Segoe UI Symbol (Thai font has no emoji glyphs)
import re
_EMOJI_RE = re.compile(r'([\U0001F300-\U0001FAFF\U00002600-\U000027BF])')
_BaseParagraph = Paragraph
def Paragraph(text, *args, **kwargs):
    return _BaseParagraph(_EMOJI_RE.sub(r'<font name="Sym">\1</font>', str(text)), *args, **kwargs)

# Colors
C_PRIMARY = HexColor('#4F46E5')
C_DARK    = HexColor('#0F172A')
C_GRAY    = HexColor('#475569')
C_MUTED   = HexColor('#94A3B8')
C_LIGHT   = HexColor('#EEF2FF')
C_SUCCESS = HexColor('#10B981')
C_WARN    = HexColor('#F59E0B')
C_DANGER  = HexColor('#EF4444')
C_USER_BG = HexColor('#DBEAFE')
C_ADMIN_BG = HexColor('#FEF3C7')

# Styles
S = {
    'cover_title':  ParagraphStyle('CT', fontName='Thai', fontSize=28, textColor=C_PRIMARY, leading=36, alignment=1, spaceAfter=8),
    'cover_sub':    ParagraphStyle('CS', fontName='Thai', fontSize=14, textColor=C_GRAY, leading=20, alignment=1),
    'h1':           ParagraphStyle('H1', fontName='Thai', fontSize=20, textColor=C_PRIMARY, leading=28, spaceBefore=16, spaceAfter=8),
    'h2':           ParagraphStyle('H2', fontName='Thai', fontSize=15, textColor=C_DARK, leading=22, spaceBefore=12, spaceAfter=6),
    'h3':           ParagraphStyle('H3', fontName='Thai', fontSize=13, textColor=C_PRIMARY, leading=18, spaceBefore=10, spaceAfter=4),
    'body':         ParagraphStyle('B', fontName='Thai', fontSize=11, textColor=C_DARK, leading=17, spaceBefore=2, spaceAfter=2),
    'step':         ParagraphStyle('ST', fontName='Thai', fontSize=11, textColor=C_DARK, leading=17, leftIndent=20, spaceBefore=2, spaceAfter=2),
    'tip':          ParagraphStyle('TP', fontName='Thai', fontSize=10, textColor=C_GRAY, leading=14, leftIndent=20, spaceBefore=4, spaceAfter=4),
    'note':         ParagraphStyle('NT', fontName='Thai', fontSize=10, textColor=HexColor('#92400E'), leading=15, leftIndent=12, rightIndent=12, spaceBefore=6, spaceAfter=6),
}

cell_s  = ParagraphStyle('CS', fontName='Thai', fontSize=10, textColor=C_DARK, leading=14)
cell_h  = ParagraphStyle('CH', fontName='Thai', fontSize=10, textColor=white, leading=14)

# Image helper — embed screenshots, skip silently if missing
IMG_DIR   = os.path.join(os.path.dirname(__file__), 'manual_images')
PAGE_W    = A4[0] - 4 * cm  # content width after margins
MAX_IMG_H = 11 * cm

def add_img(story, filename, caption=None, width_ratio=0.85):
    path = os.path.join(IMG_DIR, filename)
    if not os.path.exists(path):
        return
    iw, ih = ImageReader(path).getSize()
    tw = PAGE_W * width_ratio
    th = tw * (ih / iw)
    if th > MAX_IMG_H:
        th = MAX_IMG_H
        tw = th * (iw / ih)
    im = RLImage(path, width=tw, height=th)
    im.hAlign = 'CENTER'
    story.append(Spacer(1, 6))
    story.append(im)
    if caption:
        cap = ParagraphStyle('Cap', fontName='Thai', fontSize=9,
                             textColor=C_MUTED, leading=12, alignment=1)
        story.append(Spacer(1, 3))
        story.append(Paragraph(caption, cap))
    story.append(Spacer(1, 10))


def P(t, s=None):
    return Paragraph(str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'), s or cell_s)


def hr():
    return HRFlowable(width='100%', thickness=1, color=HexColor('#E2E8F0'), spaceBefore=6, spaceAfter=6)


def section_banner(title, color, icon_label=''):
    """Big colored banner for User/Admin section divider"""
    t = Table([[Paragraph(f'<font size="24">{icon_label}</font>  {title}',
               ParagraphStyle('SB', fontName='Thai', fontSize=22, textColor=white, leading=30))]],
              colWidths=[None])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('TOPPADDING', (0, 0), (-1, -1), 24),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 24),
        ('LEFTPADDING', (0, 0), (-1, -1), 30),
        ('ROUNDEDCORNERS', [10, 10, 10, 10]),
    ]))
    return t


def tbl(headers, rows, widths=None):
    data = [[P(h, cell_h) for h in headers]] + [[P(c) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#D0D0D0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t


def numbered_step(n, title, detail=''):
    """Render: [1] Title     detail"""
    step_num = Table([[P(str(n), ParagraphStyle('SN', fontName='Thai', fontSize=14,
                       textColor=white, leading=20, alignment=1))]],
                     colWidths=[28], rowHeights=[28])
    step_num.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), C_PRIMARY),
        ('ROUNDEDCORNERS', [14, 14, 14, 14]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    title_p = Paragraph(f'<b>{title}</b>', ParagraphStyle('ST', fontName='Thai', fontSize=12, textColor=C_DARK, leading=16))
    body = [title_p]
    if detail:
        body.append(Paragraph(detail, ParagraphStyle('SD', fontName='Thai', fontSize=10, textColor=C_GRAY, leading=14)))

    row = Table([[step_num, body]], colWidths=[38, None])
    row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return row


def note_box(text, color=C_WARN):
    """Yellow note box"""
    t = Table([[Paragraph(f'<b>💡 หมายเหตุ:</b> {text}',
              ParagraphStyle('NB', fontName='Thai', fontSize=10,
                             textColor=HexColor('#78350F'), leading=14))]], colWidths=[None])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HexColor('#FEF3C7')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LINEBEFORE', (0, 0), (0, -1), 4, C_WARN),
    ]))
    return t


def info_box(text, color=C_PRIMARY):
    """Blue info box"""
    t = Table([[Paragraph(text, ParagraphStyle('IB', fontName='Thai', fontSize=10, textColor=C_DARK, leading=14))]], colWidths=[None])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), C_LIGHT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LINEBEFORE', (0, 0), (0, -1), 4, color),
    ]))
    return t


def build():
    fn = os.path.join(os.path.dirname(__file__), 'manual.pdf')
    doc = SimpleDocTemplate(fn, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = []
    W = doc.width

    # =============== COVER ===============
    story.append(Spacer(1, 80))
    story.append(Paragraph('📘 คู่มือการใช้งาน', S['cover_title']))
    story.append(Paragraph('IT Ticket System', S['cover_title']))
    story.append(Spacer(1, 8))
    story.append(Paragraph('ระบบแจ้งปัญหา &amp; ติดตามสถานะงาน IT', S['cover_sub']))
    story.append(Spacer(1, 40))
    story.append(hr())
    story.append(Spacer(1, 12))

    sig_s = ParagraphStyle('Sig', fontName='Thai', fontSize=11, textColor=C_DARK, leading=18)
    cover = [
        [P('🌐 URL', sig_s), P('https://project-code-gamma.vercel.app', sig_s)],
        [P('📅 วันที่จัดทำ', sig_s), P(datetime.now().strftime('%d/%m/%Y'), sig_s)],
        [P('📋 เวอร์ชัน', sig_s), P('3.0', sig_s)],
        [P('📎 หมวด', sig_s), P('คู่มือสำหรับพนักงานและทีม IT', sig_s)],
    ]
    t = Table(cover, colWidths=[W*0.3, W*0.7])
    t.setStyle(TableStyle([('TOPPADDING', (0,0),(-1,-1), 10), ('BOTTOMPADDING', (0,0),(-1,-1), 10)]))
    story.append(t)
    story.append(PageBreak())

    # =============== สารบัญ ===============
    story.append(Paragraph('📑 สารบัญ', S['h1']))
    story.append(hr())

    toc_parts = [
        ('ส่วนที่ 1: สำหรับผู้ใช้งานทั่วไป (User)', C_PRIMARY, [
            '1.1  การ Login เข้าสู่ระบบ',
            '1.2  การลงทะเบียนผู้ใช้ใหม่',
            '1.3  การเปิด Ticket ใหม่ (Priority + Auto-save)',
            '1.4  การดูรายการ Ticket ของตัวเอง (SLA countdown)',
            '1.5  การยกเลิก Ticket',
            '1.6  การยืนยันปิดงาน / เปิด Ticket ใหม่',
            '1.7  การใช้ AI Chatbot (IT Support)',
            '1.8  การแชทกับทีม IT + ข้อมูลติดต่อด่วน',
            '1.9  การรับการแจ้งเตือน',
            '1.10 ติดตั้งเป็นแอปบนมือถือ (PWA)',
            '1.11 โปรไฟล์และการตั้งค่า',
        ]),
        ('ส่วนที่ 2: สำหรับทีม IT (Admin)', C_WARN, [
            '2.1  สิทธิ์และฟังก์ชันพิเศษของ Admin',
            '2.2  การดู Ticket ของทุกคน',
            '2.3  การแก้ไข Ticket',
            '2.4  การมอบหมายผู้รับผิดชอบ',
            '2.5  การอนุมัติผู้ลงทะเบียนใหม่',
            '2.6  การแชทกับผู้แจ้ง',
            '2.7  การรับแจ้งเตือน Ticket ใหม่',
            '2.8  สถานะ Ticket และความหมาย',
        ]),
        ('ส่วนที่ 3: ข้อมูลทั่วไป', C_SUCCESS, [
            '3.1  สถานะ Ticket ทั้งหมด',
            '3.2  คำถามที่พบบ่อย (FAQ)',
            '3.3  ติดต่อทีม IT',
        ]),
    ]

    for title, color, items in toc_parts:
        story.append(Paragraph(f'<font color="#{color.hexval()[2:]}"><b>{title}</b></font>', S['h3']))
        for i in items:
            story.append(Paragraph(i, ParagraphStyle('TOCI', fontName='Thai', fontSize=10, textColor=C_GRAY, leading=16, leftIndent=14)))
        story.append(Spacer(1, 4))

    story.append(PageBreak())

    # =============================================================
    # ส่วนที่ 1 — USER
    # =============================================================
    story.append(section_banner('สำหรับผู้ใช้งาน (User)', C_PRIMARY, '👤'))
    story.append(Spacer(1, 16))
    story.append(Paragraph('ส่วนนี้สำหรับพนักงานทั่วไปที่ต้องการแจ้งปัญหาหรือขอความช่วยเหลือจากทีม IT ผ่านระบบ Ticket', S['body']))
    story.append(Spacer(1, 20))

    # 1.1 Login
    story.append(Paragraph('1.1 การ Login เข้าสู่ระบบ', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'เปิดเว็บไซต์', 'ไปที่ https://project-code-gamma.vercel.app ผ่าน Browser (Chrome, Edge, Safari)'))
    story.append(numbered_step(2, 'กรอกรหัสพนักงาน', 'ใส่รหัสพนักงาน เช่น 31043'))
    story.append(numbered_step(3, 'กรอกรหัสผ่าน', 'ค่าเริ่มต้น = รหัสพนักงาน (แนะนำให้แจ้งทีม IT เพื่อเปลี่ยน password)'))
    story.append(numbered_step(4, 'กดปุ่ม "เข้าสู่ระบบ"', 'ระบบจะพาเข้าหน้าหลักอัตโนมัติ'))
    story.append(Spacer(1, 8))
    story.append(note_box('หากเป็นพนักงานใหม่ยังไม่มีบัญชี ให้กดปุ่ม "ลงทะเบียนที่นี่" (ดูขั้นตอน 1.2)'))
    add_img(story, '01_login.png', 'หน้าจอ Login')

    story.append(PageBreak())

    # 1.2 Register
    story.append(Paragraph('1.2 การลงทะเบียนผู้ใช้ใหม่', S['h2']))
    story.append(hr())
    story.append(Paragraph('สำหรับพนักงานใหม่ที่ยังไม่มีบัญชีใช้งาน', S['body']))
    story.append(Spacer(1, 6))
    story.append(numbered_step(1, 'หน้า Login กดลิงก์ "ลงทะเบียนที่นี่"', ''))
    story.append(numbered_step(2, 'กรอกข้อมูลให้ครบถ้วน', 'รหัสพนักงาน, Password, สังกัด (Comets/ICT/JA), ชื่อ, นามสกุล, ชื่อเล่น, ตำแหน่ง, อีเมล, เบอร์โทร'))
    story.append(numbered_step(3, 'กดปุ่ม "ลงทะเบียน"', 'ระบบจะส่งข้อมูลไปรออนุมัติจากทีม IT'))
    story.append(numbered_step(4, 'รอการอนุมัติ', 'Admin จะอนุมัติภายในไม่นาน หลังจากนั้น Login เข้าใช้งานได้ทันที'))
    story.append(Spacer(1, 8))
    story.append(note_box('หากต้องการใช้งานด่วน ติดต่อทีม IT โดยตรงเพื่อให้อนุมัติบัญชี'))
    add_img(story, '02_register.png', 'หน้าจอลงทะเบียนผู้ใช้ใหม่')

    story.append(Spacer(1, 16))

    # 1.3 Create ticket
    story.append(Paragraph('1.3 การเปิด Ticket ใหม่', S['h2']))
    story.append(hr())
    story.append(Paragraph('เมื่อพบปัญหาด้าน IT หรือต้องการขอความช่วยเหลือ', S['body']))
    story.append(Spacer(1, 6))
    story.append(numbered_step(1, 'คลิกเมนู "เปิด Ticket"', 'ที่แถบด้านบนของหน้าเว็บ'))
    story.append(numbered_step(2, 'เลือก บริษัท/สถานที่', 'Comets, ICT, JA (ระบบจะเลือกตามสังกัดของคุณให้อัตโนมัติ)'))
    story.append(numbered_step(3, 'เลือกประเภทงาน', 'เช่น คอมพิวเตอร์, ปริ้นเตอร์, ปัญหาโปรแกรม, ขอสิทธิ์เข้าระบบ'))
    story.append(numbered_step(4, 'เลือกประเภทปัญหา และ อาการ', 'จาก dropdown ที่ระบบเสนอให้'))
    story.append(numbered_step(5, 'เลือกโลเคชั่น', 'Comets HQ, Comets FAC, ICT, JA, บ้านแสง + ระบุโซน/จุดที่พบปัญหา'))
    story.append(numbered_step(6, 'กรอกรายละเอียดคำขอ', 'บอกปัญหาให้ละเอียด เช่น "คอมเปิดไม่ติด กดปุ่มแล้วมีเสียงบี๊บ 3 ครั้ง"'))
    story.append(numbered_step(7, 'เลือกระดับความเร่งด่วน (Priority)',
        '🔴 ด่วนมาก (งานหยุด) · 🟠 สำคัญ (ต้องเสร็จวันนี้) · 🟡 ปกติ (ค่าเริ่มต้น) · 🟢 ไม่เร่ง (ขอเสริม)'))
    story.append(numbered_step(8, 'แนบรูปหรือไฟล์ (ถ้ามี)', 'แนบได้สูงสุด 5 รูป × 5 MB และ 5 ไฟล์เอกสาร × 10 MB'))
    story.append(numbered_step(9, 'กดปุ่ม "ส่ง Ticket"', 'ระบบจะสร้างเลข Ticket อัตโนมัติ เช่น IT26040288 และแสดง progress bar ตอนอัปโหลด'))
    story.append(Spacer(1, 8))
    story.append(info_box('<b>💡 Tip:</b> ยิ่งบอกรายละเอียดเยอะ + แนบ screenshot ทีม IT ก็จะช่วยได้เร็วขึ้น'))
    story.append(info_box('<b>🔄 Auto-save:</b> ระบบจะบันทึกข้อมูลในฟอร์มทุก 0.5 วินาที ถ้าอินเทอร์เน็ตหลุดหรือรีเฟรชหน้าระหว่างกรอก สามารถกลับมากรอกต่อได้ (เก็บได้ 24 ชม.)'))
    story.append(info_box('<b>⚠️ ถ้าส่งไม่สำเร็จ:</b> รูปที่อัปโหลดแล้วจะไม่ถูกอัปใหม่ · กดปุ่ม "ลองส่งใหม่" ได้ทันที ไม่ต้องเลือกไฟล์ใหม่'))
    add_img(story, '03_new_ticket.png', 'ฟอร์มเปิด Ticket ใหม่ พร้อมช่องเลือกระดับความเร่งด่วน')

    story.append(PageBreak())

    # 1.4 View tickets
    story.append(Paragraph('1.4 การดูรายการ Ticket ของตัวเอง', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'คลิกเมนู "Ticket List"', 'จะเห็นเฉพาะ Ticket ของคุณเองทั้งหมด'))
    story.append(numbered_step(2, 'ใช้ Filter ด้านบน', 'คลิกเพื่อกรองตามสถานะ: ทั้งหมด / เปิด Ticket / กำลังดำเนินการ / เสร็จเรียบร้อย / ยกเลิก'))
    story.append(numbered_step(3, 'ค้นหาด้วยคำค้น', 'พิมพ์คำค้นในช่องค้นหา (เลข ticket, ประเภท, รายละเอียด)'))
    story.append(numbered_step(4, 'คลิกปุ่ม 👁️ "ดู"', 'ดูรายละเอียด Ticket ทั้งหมด รวมรูปแนบ + ข้อความตอบกลับจาก IT'))
    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>คอลัมน์ที่สำคัญ:</b>', S['body']))
    story.append(Paragraph('• <b>Priority</b> — 🔴🟠🟡🟢 บอกระดับความเร่งด่วน · เรียง Urgent มาก่อนอัตโนมัติ', S['step']))
    story.append(Paragraph('• <b>SLA</b> — เวลาที่เหลือก่อนครบกำหนด (นับเฉพาะเวลาทำงาน จ-ศ 08:00–17:00) · เหลือน้อย = สีเหลือง · เกินกำหนด = สีแดง', S['step']))
    story.append(Paragraph('• <b>สถานะ</b> — "เปิด Ticket" → "กำลังดำเนินการ" → "ดำเนินการเรียบร้อย" → "ปิดงานแล้ว"', S['step']))
    story.append(Spacer(1, 6))
    story.append(info_box('<b>📄 Pagination:</b> ระบบโหลด 100 Ticket ล่าสุดก่อน ถ้าต้องการดูเก่ากว่ากดปุ่ม "โหลดเพิ่ม" ด้านล่างตาราง'))
    add_img(story, '04_ticket_list.png', 'หน้ารายการ Ticket พร้อม Priority + SLA countdown + สถานะ')
    add_img(story, '05_ticket_detail.png', 'Modal รายละเอียด Ticket (เมื่อกดปุ่ม "ดู")')
    story.append(Spacer(1, 10))

    # 1.5 Cancel
    story.append(Paragraph('1.5 การยกเลิก Ticket', S['h2']))
    story.append(hr())
    story.append(Paragraph('หากต้องการยกเลิกคำขอที่ส่งไป (เช่น แก้ปัญหาได้เองแล้ว)', S['body']))
    story.append(Spacer(1, 6))
    story.append(numbered_step(1, 'ไปที่ Ticket List', 'หาปุ่ม ❌ สีแดงในแถว Ticket ที่ต้องการยกเลิก'))
    story.append(numbered_step(2, 'กดปุ่ม ❌', 'ระบบจะถามยืนยัน'))
    story.append(numbered_step(3, 'กดยืนยัน', 'สถานะจะเปลี่ยนเป็น "ยกเลิก" ทันที'))
    story.append(Spacer(1, 8))
    story.append(note_box('ยกเลิกได้เฉพาะ Ticket ที่ยังอยู่ในสถานะ "เปิด Ticket" เท่านั้น หากทีม IT เริ่มดำเนินการแล้วต้องติดต่อทีม IT โดยตรง'))

    story.append(Spacer(1, 16))

    # 1.6 User sign-off (confirm / reopen)
    story.append(Paragraph('1.6 การยืนยันปิดงาน / เปิด Ticket ใหม่', S['h2']))
    story.append(hr())
    story.append(Paragraph('เมื่อทีม IT ทำงานเสร็จ จะเปลี่ยนสถานะเป็น <b>"ดำเนินการเรียบร้อย"</b> และรอให้ผู้แจ้งยืนยันว่างานเสร็จจริง', S['body']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>กรณี 1: งานแก้ไขเรียบร้อย</b>', S['h3']))
    story.append(numbered_step(1, 'ไปที่ Ticket List', 'หา Ticket ที่สถานะ "ดำเนินการเรียบร้อย" (ของตัวเอง)'))
    story.append(numbered_step(2, 'กดปุ่ม ✓ สีเขียว "ยืนยันปิดงาน"', 'สถานะจะเปลี่ยนเป็น "ปิดงานแล้ว" · ทีม IT ได้รับแจ้งเตือน'))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>กรณี 2: ปัญหายังไม่หาย / ต้องการเปิดใหม่</b>', S['h3']))
    story.append(numbered_step(1, 'กดปุ่ม ↺ สีส้ม "ยังไม่เสร็จ/เปิดใหม่"', ''))
    story.append(numbered_step(2, 'ใส่เหตุผลว่าทำไมยังไม่เสร็จ', 'เช่น "ปัญหากลับมาเกิดอีก" / "วิธีแก้ที่ให้มาไม่ได้ผล" / "อาการใหม่เพิ่มเติม"'))
    story.append(numbered_step(3, 'กด "ยืนยันเปิดใหม่"', 'สถานะจะกลับเป็น "เปิด Ticket" · ทีม IT ได้รับแจ้งเตือนพร้อมเหตุผลของคุณ'))
    story.append(Spacer(1, 8))
    story.append(info_box('<b>⏰ Auto-close 7 วัน:</b> ถ้าไม่กดยืนยันภายใน 7 วัน ระบบจะปิด Ticket อัตโนมัติ · หากปัญหากลับมาภายหลัง สามารถกดเปิดใหม่ได้'))
    story.append(note_box('ใน modal "รายละเอียด Ticket" จะมี banner นับถอยหลังบอกว่าอีกกี่วันจะปิดอัตโนมัติ (แถบสีฟ้า ถ้าเหลือ ≤2 วันจะเปลี่ยนเป็นสีส้ม)'))

    story.append(PageBreak())

    # 1.7 AI Chatbot (was 1.6)
    story.append(Paragraph('1.7 การใช้ AI Chatbot (IT Support)', S['h2']))
    story.append(hr())
    story.append(Paragraph('ใช้ AI Chatbot เพื่อสอบถามปัญหา IT เบื้องต้น ตอบได้ทันที 24 ชั่วโมง', S['body']))
    story.append(Spacer(1, 6))
    story.append(numbered_step(1, 'มองหาปุ่มแชทด้านซ้ายของหน้าจอ', 'ปุ่มสีม่วง 🤖 IT Support'))
    story.append(numbered_step(2, 'คลิกเปิดกล่องแชท', ''))
    story.append(numbered_step(3, 'พิมพ์ปัญหาของคุณ', 'เช่น "คอมค้าง", "ปริ้นไม่ออก", "อยากลง VS Code", "wifi เชื่อมไม่ได้"'))
    story.append(numbered_step(4, 'AI ตอบพร้อมแนะนำวิธีแก้', 'อ่านและทำตามขั้นตอน'))
    story.append(numbered_step(5, 'หากแก้ได้ → จบ', 'ไม่ต้องเปิด Ticket'))
    story.append(numbered_step(6, 'หากแก้ไม่ได้ บอก AI ว่า "ไม่หาย"', 'AI จะเปิด Ticket ให้อัตโนมัติ พร้อมกรอกข้อมูลจากบทสนทนา'))
    story.append(Spacer(1, 8))
    story.append(info_box('<b>🤖 AI ฉลาดขึ้นเรื่อยๆ:</b> ทุกครั้งที่ Admin ปิด Ticket พร้อมใส่วิธีแก้ ระบบจะเรียนรู้อัตโนมัติ — คำถามเดิมครั้งต่อไป AI จะตอบได้เลย'))
    add_img(story, '09_ai_chatbot.png', 'กล่องแชท AI IT Support (ปุ่มสีม่วงด้านซ้าย)')

    story.append(PageBreak())

    # 1.7 Ticket chat
    story.append(Paragraph('1.8 การแชทกับทีม IT ใน Ticket + ข้อมูลติดต่อด่วน', S['h2']))
    story.append(hr())
    story.append(Paragraph('เมื่อมี Ticket ที่ทีม IT เริ่มตอบกลับ จะสามารถแชทโต้ตอบได้', S['body']))
    story.append(Spacer(1, 6))
    story.append(numbered_step(1, 'เมื่อทีม IT ส่งข้อความมา', 'ปุ่มแชทสีเขียวด้านซ้ายจะโผล่ขึ้นมาพร้อม badge สีแดงแสดงจำนวนข้อความใหม่'))
    story.append(numbered_step(2, 'คลิกเปิดกล่องแชท', 'จะเห็นรายการ Ticket ที่มีการสนทนา'))
    story.append(numbered_step(3, 'คลิก Ticket ที่ต้องการ', 'เข้าดูข้อความทั้งหมด'))
    story.append(numbered_step(4, 'พิมพ์ตอบ หรือแนบรูป/ไฟล์', 'รองรับรูปภาพ และไฟล์ PDF, Word, Excel, ZIP (สูงสุด 10 MB/ไฟล์)'))
    story.append(numbered_step(5, 'กด ➤ เพื่อส่ง', 'ทีม IT จะได้รับแจ้งเตือนทันที (ส่งแบบ Realtime · ไม่ต้องรอ refresh)'))
    story.append(Spacer(1, 8))
    story.append(info_box('ข้อความแชททั้งหมด<b>ถูกเก็บถาวร</b>ใน Ticket สามารถย้อนดูได้ตลอด'))
    story.append(info_box('<b>⚡ Realtime:</b> ข้อความเด้งทันทีแบบ LINE (ไม่ต้องรอโพลล์ 5 วินาที) · Shift+Enter = ขึ้นบรรทัดใหม่ · Enter = ส่ง'))
    add_img(story, '10_ticket_chat.png', 'กล่องแชทระหว่างผู้แจ้งกับทีม IT')

    story.append(Spacer(1, 10))
    story.append(Paragraph('<b>📞 ข้อมูลติดต่อด่วน (Contact Popup)</b>', S['h3']))
    story.append(Paragraph('ในรายการแชท Ticket ทางซ้าย คลิกที่ไอคอน avatar ข้างชื่อ Ticket จะเปิดกล่องข้อมูลติดต่อเล็กๆ', S['body']))
    story.append(numbered_step(1, 'คลิกไอคอน avatar ใน chat list', 'Popup เด้งโชว์ข้อมูลของอีกฝ่าย'))
    story.append(numbered_step(2, 'กดที่เบอร์โทรศัพท์', 'เปิดหน้าต่างโทรออกทันที (บนมือถือ) หรือ copy ได้'))
    story.append(numbered_step(3, 'กดที่อีเมล', 'เปิดโปรแกรมส่งเมลพร้อมกรอกปลายทางให้เรียบร้อย'))
    story.append(Spacer(1, 6))
    story.append(info_box('<b>📌 ใช้เมื่อไหร่?</b> เมื่องานด่วนมากจริงๆ ต้องการโทร/อีเมลตรงถึง IT (หรือ IT โทรหาผู้แจ้ง) โดยไม่ต้องเปิด HR directory'))
    add_img(story, '17_contact_popup.png', 'Contact popup — เบอร์โทร + อีเมลของอีกฝ่าย กดเพื่อโทร/เมลได้ทันที')

    story.append(Spacer(1, 16))

    # 1.8 Notifications
    story.append(Paragraph('1.9 การรับการแจ้งเตือน', S['h2']))
    story.append(hr())
    story.append(Paragraph('ระบบแจ้งเตือนเมื่อมีการเปลี่ยนแปลงใน Ticket ของคุณ', S['body']))
    story.append(Spacer(1, 8))
    story.append(tbl(
        ['กรณี', 'ได้รับการแจ้งเตือนอย่างไร'],
        [
            ['IT รับ Ticket (เปลี่ยนสถานะ)', 'กระดิ่ง 🔔 บนขวา + popup เด้งแจ้ง'],
            ['IT ส่งข้อความแชท', 'ปุ่มแชทสีเขียว + badge + popup'],
            ['IT ใส่วิธีแก้และปิด Ticket', 'กระดิ่ง 🔔 + popup'],
        ],
        [W*0.4, W*0.6]
    ))
    add_img(story, '08_notifications.png', 'Panel การแจ้งเตือน (กดกระดิ่งบนขวา)')
    story.append(Spacer(1, 12))

    # 1.9 PWA
    story.append(Paragraph('1.10 ติดตั้งเป็นแอปบนมือถือ (PWA)', S['h2']))
    story.append(hr())
    story.append(Paragraph('<b>📱 Android (Chrome):</b>', S['h3']))
    story.append(numbered_step(1, 'เปิด Chrome', 'เข้าเว็บไซต์ระบบ'))
    story.append(numbered_step(2, 'กดเมนู 3 จุดมุมขวาบน', ''))
    story.append(numbered_step(3, 'เลือก "Add to Home Screen" หรือ "ติดตั้งแอป"', 'Icon จะโผล่ในหน้าจอหลักเหมือนแอปจริง'))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>🍎 iPhone (Safari):</b>', S['h3']))
    story.append(numbered_step(1, 'เปิด Safari (ห้ามใช้ Chrome บน iOS)', ''))
    story.append(numbered_step(2, 'กดปุ่ม Share 􀈂 ด้านล่าง', ''))
    story.append(numbered_step(3, 'เลือก "Add to Home Screen"', 'ตั้งชื่อแล้วกด Add'))

    story.append(PageBreak())

    # 1.11 Profile / Settings
    story.append(Paragraph('1.11 โปรไฟล์และการตั้งค่า', S['h2']))
    story.append(hr())
    story.append(Paragraph('คลิกปุ่ม 3 จุด (⋮) มุมบนขวา → เลือก "โปรไฟล์ของฉัน" เพื่อเข้าหน้าตั้งค่าส่วนตัว', S['body']))
    add_img(story, '11_user_menu.png', 'เมนู 3 จุดที่มุมบนขวา — มี โปรไฟล์ของฉัน / ออกจากระบบ')
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>แท็บ "ข้อมูล"</b> — แก้ไข ชื่อเล่น, Email, เบอร์โทร (รหัสพนักงานและแผนกแก้ไม่ได้ ติดต่อ IT)', S['body']))
    add_img(story, '12_profile_info.png', 'แท็บข้อมูลส่วนตัว')

    story.append(Paragraph('<b>แท็บ "รูปโปรไฟล์"</b> — อัปโหลดรูปโปรไฟล์ (JPG/PNG สูงสุด 5 MB)', S['body']))
    add_img(story, '13_profile_avatar.png', 'แท็บรูปโปรไฟล์')

    story.append(Paragraph('<b>แท็บ "รหัสผ่าน"</b> — เปลี่ยนรหัสผ่าน (ต้องกรอกรหัสเดิมก่อน)', S['body']))
    add_img(story, '14_profile_password.png', 'แท็บเปลี่ยนรหัสผ่าน')

    story.append(Paragraph('<b>แท็บ "ธีม"</b> — ปรับรูปลักษณ์การใช้งาน: Light/Dark/Auto, สีหลัก 6 สี, ขนาดตัวอักษร', S['body']))
    add_img(story, '15_profile_theme.png', 'แท็บธีม — ตั้งค่าการแสดงผล')

    story.append(Paragraph('<b>แท็บ "แจ้งเตือน"</b> — เปิด/ปิดเสียงแจ้งเตือน + popup เด้งขวาบน (การแจ้งเตือนในกระดิ่งยังทำงานปกติ)', S['body']))
    add_img(story, '16_profile_notify.png', 'แท็บแจ้งเตือน — ตั้งค่าเสียงและ popup')

    story.append(Spacer(1, 8))
    story.append(info_box('การตั้งค่าธีม + แจ้งเตือนจะถูกบันทึกในเครื่องนี้อัตโนมัติ (localStorage) — เข้าเครื่องอื่นต้องตั้งใหม่'))

    story.append(PageBreak())

    # =============================================================
    # ส่วนที่ 2 — ADMIN
    # =============================================================
    story.append(section_banner('สำหรับทีม IT (Admin)', C_WARN, '🔧'))
    story.append(Spacer(1, 16))
    story.append(Paragraph('ส่วนนี้สำหรับทีม IT ที่มีสิทธิ์ Admin (is_admin = true) ใช้ในการดูและจัดการ Ticket จากพนักงานทุกคน', S['body']))
    story.append(Spacer(1, 16))

    # 2.1 Admin privileges
    story.append(Paragraph('2.1 สิทธิ์และฟังก์ชันพิเศษของ Admin', S['h2']))
    story.append(hr())
    story.append(Paragraph('บัญชีที่เป็น Admin จะเห็นเมนูและปุ่มเพิ่มเติม ต่อไปนี้:', S['body']))
    story.append(Spacer(1, 8))
    story.append(tbl(
        ['ฟังก์ชัน', 'User', 'Admin'],
        [
            ['ดู Ticket ของตัวเอง', '✅', '✅'],
            ['ดู Ticket ของคนอื่น', '❌', '✅'],
            ['แก้ไข Ticket (สถานะ/วิธีแก้)', '❌', '✅'],
            ['มอบหมายผู้รับผิดชอบ', '❌', '✅'],
            ['อนุมัติผู้ลงทะเบียนใหม่', '❌', '✅'],
            ['แชทตอบ User', '✅ เฉพาะ Ticket ตนเอง', '✅ ทุก Ticket'],
            ['กระดิ่งแจ้งเตือน Ticket ใหม่', '❌', '✅'],
            ['ยกเลิก Ticket ตัวเอง', '✅ (ก่อนเริ่มงาน)', '✅ (ผ่านการแก้ไข)'],
        ],
        [W*0.5, W*0.25, W*0.25]
    ))

    story.append(PageBreak())

    # 2.2 View all tickets
    story.append(Paragraph('2.2 การดู Ticket ของทุกคน', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'คลิก "Ticket List"', 'จะเห็น Ticket ของพนักงานทุกคน (User จะเห็นเฉพาะของตัวเอง)'))
    story.append(numbered_step(2, 'ใช้ Filter', 'กรองตามสถานะเพื่อโฟกัสงานที่ต้องจัดการก่อน'))
    story.append(numbered_step(3, 'ดูสรุปตัวเลขด้านบน', 'เห็นจำนวน ticket ในแต่ละสถานะ รวมถึงเลขที่รอรับ'))
    story.append(Spacer(1, 8))
    story.append(info_box('🔔 <b>Auto-refresh</b>: ระบบจะโหลด Ticket ใหม่อัตโนมัติทุก 30 วินาที ไม่ต้องกด F5 เอง'))

    story.append(Spacer(1, 16))

    # 2.3 Edit ticket
    story.append(Paragraph('2.3 การแก้ไข Ticket', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'คลิกปุ่มดินสอเขียว ✏️', 'ในแถว Ticket ที่ต้องการแก้ไข'))
    story.append(numbered_step(2, 'Modal เปิดขึ้น พร้อมข้อมูลสรุป Ticket', 'ผู้แจ้ง, สถานที่, ประเภทปัญหา, รายละเอียด'))
    story.append(numbered_step(3, 'เลือก "ผู้รับผิดชอบ"', 'จาก dropdown รายชื่อทีม IT ที่ active'))
    story.append(numbered_step(4, 'ปรับ "Priority"', '🔴 ด่วนมาก / 🟠 สำคัญ / 🟡 ปกติ / 🟢 ไม่เร่ง · SLA deadline จะคำนวณใหม่อัตโนมัติ'))
    story.append(numbered_step(5, 'เปลี่ยน "สถานะ"', 'เปิด Ticket → กำลังดำเนินการ → ต้องการ Approve → ดำเนินการเรียบร้อย (รอ user ยืนยัน) / ยกเลิก'))
    story.append(numbered_step(6, 'กรอก "วิธีแก้ไขปัญหา"', 'อธิบายวิธีแก้ที่ใช้จริง (ข้อมูลนี้จะถูกเรียนรู้โดย AI)'))
    story.append(numbered_step(7, 'ดูประวัติการแก้ไขด้านล่าง', 'เห็นใคร/เมื่อไหร่/เปลี่ยนอะไร'))
    story.append(numbered_step(8, 'กดปุ่ม "บันทึก"', 'ระบบจะแจ้ง User ทันที + บันทึกประวัติอัตโนมัติ'))
    story.append(Spacer(1, 8))
    story.append(info_box('📚 <b>AI เรียนรู้อัตโนมัติ:</b> เมื่อเปลี่ยนสถานะเป็น "ดำเนินการเรียบร้อย" + ใส่วิธีแก้ ระบบจะเพิ่มเข้า Knowledge Base ทันที'))
    story.append(note_box('<b>⚠️ "ปิดงานแล้ว"</b> = สถานะที่ <b>ผู้แจ้งกดยืนยันเอง</b>เท่านั้น · Admin เลือกให้ใน dropdown ไม่ได้ · ถ้าผู้แจ้งไม่ยืนยันภายใน 7 วัน ระบบจะปิดอัตโนมัติ'))
    add_img(story, '06_admin_edit.png', 'Modal แก้ไข Ticket สำหรับ Admin (มี Priority dropdown)')

    story.append(PageBreak())

    # 2.4 Assign
    story.append(Paragraph('2.4 การมอบหมายผู้รับผิดชอบ', S['h2']))
    story.append(hr())
    story.append(Paragraph('Dropdown "ผู้รับผิดชอบ" จะดึงรายชื่อทีม IT ทั้งหมดที่ <b>is_admin = true</b> มาให้เลือก รูปแบบ: <code>IT03_วี, IT07_ปุ๊ก</code>', S['body']))
    story.append(Spacer(1, 8))
    story.append(note_box('หากต้องการเพิ่ม/ลบสมาชิกทีม IT ให้แก้ที่ตาราง <b>employees</b> ใน Supabase → column <b>is_admin</b>'))

    story.append(Spacer(1, 16))

    # 2.5 Approval
    story.append(Paragraph('2.5 การอนุมัติผู้ลงทะเบียนใหม่', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'คลิกเมนู "อนุมัติ"', 'บน navbar (badge สีแดงแสดงจำนวนคนรอ)'))
    story.append(numbered_step(2, 'ดูรายชื่อที่ลงทะเบียน', 'รหัส, ชื่อ, สังกัด, ตำแหน่ง, อีเมล, วันที่สมัคร'))
    story.append(numbered_step(3, 'กดปุ่มเขียว ✅ อนุมัติ', 'User เข้าใช้งานได้ทันที'))
    story.append(numbered_step(4, 'หรือปุ่มแดง ❌ ปฏิเสธ', 'ลบการสมัครทิ้ง'))
    add_img(story, '07_approval.png', 'หน้าอนุมัติผู้ลงทะเบียนใหม่ (สำหรับ Admin)')

    story.append(Spacer(1, 16))

    # 2.6 Chat with user
    story.append(Paragraph('2.6 การแชทกับผู้แจ้ง', S['h2']))
    story.append(hr())
    story.append(numbered_step(1, 'คลิกปุ่มแชทสีเขียวด้านซ้าย', 'จะเห็นรายการ Ticket ทั้งหมดที่มีการสนทนา (สำหรับ Admin)'))
    story.append(numbered_step(2, 'คลิก Ticket ที่ต้องการ', 'ดูประวัติการสนทนา'))
    story.append(numbered_step(3, 'พิมพ์ตอบ หรือแนบรูป/ไฟล์', 'รองรับภาพ และไฟล์ขนาดไม่เกิน 10 MB'))
    story.append(numbered_step(4, 'กด ➤', 'User จะได้รับการแจ้งเตือนทันที'))

    story.append(Spacer(1, 16))

    # 2.7 Notifications
    story.append(Paragraph('2.7 การรับแจ้งเตือน Ticket ใหม่', S['h2']))
    story.append(hr())
    story.append(Paragraph('<b>กระดิ่ง 🔔 บนขวาของ navbar</b> จะแจ้งเตือนเมื่อ:', S['body']))
    story.append(Paragraph('• มี Ticket ใหม่เข้ามาที่ยังไม่มีคนรับ (สถานะ "เปิด Ticket")', S['step']))
    story.append(Paragraph('• User ส่งข้อความใน Ticket ที่คุณดูแลอยู่', S['step']))
    story.append(Paragraph('• มี popup เด้งขึ้นมา + เสียง beep ทุก 30 วินาที', S['step']))

    story.append(PageBreak())

    # 2.8 Statuses
    story.append(Paragraph('2.8 สถานะ Ticket และความหมาย', S['h2']))
    story.append(hr())
    story.append(tbl(
        ['สถานะ', 'สี Badge', 'ความหมาย', 'ใครเปลี่ยนได้'],
        [
            ['เปิด Ticket',         '🟡 เหลือง',  'เพิ่งส่ง ยังไม่มีคนรับ (default ตอนสร้าง)',                         'Admin / User (ยกเลิก)'],
            ['กำลังดำเนินการ',       '🔵 น้ำเงิน', 'ทีม IT กำลังแก้ไข',                                               'Admin'],
            ['ต้องการ Approve',      '🟠 ส้ม',    'รอผู้บริหาร/หัวหน้าอนุมัติ (เช่น ขอซื้อ/ขอเปลี่ยนอุปกรณ์)',          'Admin'],
            ['ดำเนินการเรียบร้อย',   '🟢 เขียว',  'IT แก้เสร็จ รอผู้แจ้งยืนยัน (AI learn แล้ว)',                      'Admin'],
            ['ปิดงานแล้ว',          '🟢 เขียวเข้ม','ผู้แจ้งยืนยันว่างานเสร็จจริง (สถานะสุดท้าย)',                      'User เท่านั้น / ระบบ (auto หลัง 7 วัน)'],
            ['ยกเลิก',              '⚫ เทา',    'ยกเลิก Ticket',                                                  'Admin / User (ก่อนเริ่มงาน)'],
        ],
        [W*0.18, W*0.14, W*0.42, W*0.26]
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>Priority × SLA (เวลาทำงาน จ–ศ 08:00–17:00):</b>', S['body']))
    story.append(tbl(
        ['Priority', 'SLA (ชม. ทำงาน)', 'ใช้เมื่อไหร่'],
        [
            ['🔴 Urgent',  '2 ชม.',  'งานหยุด / CEO / ปิดบัญชี'],
            ['🟠 High',    '4 ชม.',  'ทำงานคนเดียวไม่ได้ ต้องเสร็จวันนี้'],
            ['🟡 Medium',  '8 ชม.',  'ค่าเริ่มต้น · มีปัญหาแต่ทำอย่างอื่นไปพลางได้'],
            ['🟢 Low',     '24 ชม.', 'ขอเสริม / ไม่เร่ง'],
        ],
        [W*0.22, W*0.22, W*0.56]
    ))
    story.append(Spacer(1, 8))
    story.append(info_box('Auto-close อัตโนมัติหลัง 7 วันถ้าผู้แจ้งไม่ยืนยัน · ระบบแจ้งเตือน User ว่าเกิดอะไร · User กด "เปิดใหม่" ได้ตลอดถ้าปัญหากลับมา'))
    story.append(PageBreak())

    # =============================================================
    # ส่วนที่ 3 — ข้อมูลทั่วไป
    # =============================================================
    story.append(section_banner('ข้อมูลทั่วไป', C_SUCCESS, 'ℹ️'))
    story.append(Spacer(1, 16))

    # 3.1 All statuses summary
    story.append(Paragraph('3.1 สรุปสถานะ Ticket ทั้งหมด', S['h2']))
    story.append(hr())
    story.append(Paragraph('Flow การเปลี่ยนสถานะปกติ:', S['body']))
    story.append(Spacer(1, 4))
    flow = Table([
        [P('🟡 เปิด Ticket', cell_s), P('→', cell_s), P('🔵 กำลังดำเนินการ', cell_s), P('→', cell_s), P('🟢 เสร็จเรียบร้อย', cell_s)],
    ], colWidths=[W*0.2, W*0.05, W*0.2, W*0.05, W*0.2])
    flow.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 0), (0, 0), HexColor('#FEF3C7')),
        ('BACKGROUND', (2, 0), (2, 0), HexColor('#DBEAFE')),
        ('BACKGROUND', (4, 0), (4, 0), HexColor('#D1FAE5')),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(flow)
    story.append(Spacer(1, 14))

    # 3.2 FAQ
    story.append(Paragraph('3.2 คำถามที่พบบ่อย (FAQ)', S['h2']))
    story.append(hr())

    faqs = [
        ('Q: ลืม password ทำอย่างไร?',
         'A: ติดต่อทีม IT โดยตรงเพื่อ reset password หรือแก้ใน Supabase Table Editor'),
        ('Q: เปิด Ticket ผิด ยกเลิกได้ไหม?',
         'A: ได้ ถ้ายังอยู่ในสถานะ "เปิด Ticket" ให้กดปุ่ม ❌ ที่ Ticket List'),
        ('Q: AI ตอบไม่ถูก/ไม่เข้าใจทำอย่างไร?',
         'A: พิมพ์ว่า "ไม่หาย" หรือ "ส่งให้ IT" → ระบบจะเปิด Ticket ให้ทีม IT ดูแลโดยตรง'),
        ('Q: แนบรูปหลายรูปได้ไหม?',
         'A: ได้ สูงสุด 5 รูป × 5 MB/รูป และแนบไฟล์เอกสารได้อีก 5 ไฟล์ × 10 MB/ไฟล์'),
        ('Q: Admin คือใครบ้าง?',
         'A: Admin, IT03 (วี), IT07 (ปุ๊ก), IT08 (แชมป์), IT09 (ยาม้าล)'),
        ('Q: Login ไม่ได้ ขึ้นว่า "บัญชีถูกปิดการใช้งาน"',
         'A: บัญชีพนักงานที่ลาออกแล้วจะ login ไม่ได้ ติดต่อทีม IT หากเป็นความผิดพลาด'),
        ('Q: Login แล้วขึ้น "รอการอนุมัติ"',
         'A: บัญชีใหม่ที่ลงทะเบียนต้องรอ Admin อนุมัติก่อน ติดต่อทีม IT ได้โดยตรง'),
        ('Q: ข้อความแชทถูกเก็บไว้ที่ไหน?',
         'A: ใน Supabase (ตาราง ticket_messages) ถาวร ไม่ถูกลบทิ้ง'),
    ]

    for q, a in faqs:
        story.append(Paragraph(f'<b>{q}</b>', ParagraphStyle('FAQ_Q', fontName='Thai', fontSize=11, textColor=C_PRIMARY, leading=16, spaceBefore=6)))
        story.append(Paragraph(a, ParagraphStyle('FAQ_A', fontName='Thai', fontSize=11, textColor=C_DARK, leading=16, leftIndent=12)))

    story.append(Spacer(1, 16))

    # 3.3 Contact
    story.append(Paragraph('3.3 ติดต่อทีม IT', S['h2']))
    story.append(hr())
    story.append(Paragraph('หากต้องการความช่วยเหลือเพิ่มเติม สามารถติดต่อได้ผ่าน:', S['body']))
    story.append(Spacer(1, 6))
    story.append(tbl(
        ['ช่องทาง', 'รายละเอียด'],
        [
            ['ระบบ IT Ticket', 'ช่องทางหลัก (แนะนำ) — ผ่านเว็บหรือแอปมือถือ'],
            ['AI Chatbot', 'สอบถามเบื้องต้น 24 ชม. — ผ่านปุ่มแชทด้านซ้ายของเว็บ'],
            ['เดินเข้าไปพบโดยตรง', 'ห้อง IT — สำหรับกรณีเร่งด่วน'],
            ['ทีม IT ปัจจุบัน', 'Admin, IT03 วี, IT07 ปุ๊ก, IT08 แชมป์, IT09 ยาม้าล'],
        ],
        [W*0.3, W*0.7]
    ))

    story.append(Spacer(1, 30))
    story.append(hr())

    # End
    story.append(Spacer(1, 10))
    end_style = ParagraphStyle('End', fontName='Thai', fontSize=10, textColor=C_MUTED, leading=14, alignment=1)
    story.append(Paragraph('— จบคู่มือการใช้งาน —', end_style))
    story.append(Paragraph(f'คู่มือนี้จัดทำ ณ วันที่ {datetime.now().strftime("%d/%m/%Y")} • เวอร์ชัน 3.0', end_style))
    story.append(Paragraph('สำหรับปัญหาการใช้งานคู่มือ หรือมีข้อเสนอแนะเพิ่มเติม ติดต่อทีม IT ได้โดยตรง', end_style))

    doc.build(story)
    print(f'PDF created: {fn}')


if __name__ == '__main__':
    build()
