"""
Generate Bot-Capabilities.pdf from the two Markdown files.

Uses reportlab directly (no markdown→html conversion) since we control
the source format and want consistent styling. Renders Thai text with
a system Thai font (Tahoma on Windows, Noto Sans Thai on Linux).
"""
import os
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether,
    SimpleDocTemplate,
)


HERE = Path(__file__).parent
OUT = HERE / "Bot-Capabilities.pdf"
SOURCES = [
    HERE / "01-IT-Ticket-Bot.md",
    HERE / "02-Meeting-Rooms-Bot.md",
]


# ─── Fonts ──────────────────────────────────────────────────────────
# Try Windows Tahoma first (excellent Thai coverage), fall back to
# anything we can find. Without a Thai-capable font reportlab renders
# Thai characters as boxes.
def register_fonts():
    candidates = [
        ("Tahoma", "C:/Windows/Fonts/tahoma.ttf", "C:/Windows/Fonts/tahomabd.ttf"),
        ("Sarabun", "C:/Windows/Fonts/Sarabun-Regular.ttf", "C:/Windows/Fonts/Sarabun-Bold.ttf"),
        ("LeelawadeeUI", "C:/Windows/Fonts/LeelawUI.ttf", "C:/Windows/Fonts/LeelaUIb.ttf"),
        ("NotoSansThai", "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
         "/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf"),
    ]
    for name, regular, bold in candidates:
        if os.path.exists(regular):
            pdfmetrics.registerFont(TTFont(name, regular))
            try:
                if os.path.exists(bold):
                    pdfmetrics.registerFont(TTFont(name + "-Bold", bold))
                    return name, name + "-Bold"
            except Exception:
                pass
            return name, name
    raise RuntimeError("No Thai-capable font found. Install Sarabun or use Windows Tahoma.")


FONT, FONT_BOLD = register_fonts()
print(f"Using font: {FONT} (bold: {FONT_BOLD})")


# ─── Styles ─────────────────────────────────────────────────────────
def styles():
    base = getSampleStyleSheet()
    INK = colors.HexColor("#111827")
    INK_2 = colors.HexColor("#374151")
    INK_3 = colors.HexColor("#6b7280")
    return {
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName=FONT_BOLD,
            fontSize=20, leading=26, spaceBefore=16, spaceAfter=10,
            textColor=INK,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName=FONT_BOLD,
            fontSize=14, leading=20, spaceBefore=18, spaceAfter=6,
            textColor=INK,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], fontName=FONT_BOLD,
            fontSize=11.5, leading=16, spaceBefore=12, spaceAfter=4,
            textColor=INK_2,
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"], fontName=FONT,
            fontSize=10, leading=15, spaceAfter=4,
            textColor=INK_2,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["BodyText"], fontName=FONT,
            fontSize=10, leading=15, leftIndent=14, bulletIndent=2,
            spaceAfter=2, textColor=INK_2,
        ),
        "code": ParagraphStyle(
            "code", parent=base["BodyText"], fontName="Courier",
            fontSize=9, leading=12, leftIndent=8, rightIndent=8,
            spaceBefore=4, spaceAfter=8,
            backColor=colors.HexColor("#f9fafb"),
            borderPadding=6,
            textColor=INK_2,
        ),
        "blockquote": ParagraphStyle(
            "blockquote", parent=base["BodyText"], fontName=FONT,
            fontSize=10.5, leading=15, leftIndent=12, rightIndent=8,
            spaceBefore=4, spaceAfter=10,
            textColor=INK_3,
            borderPadding=0,
        ),
    }


S = styles()


# ─── Markdown → reportlab flowables ─────────────────────────────────
def strip_emoji(text):
    """Remove emoji + symbol characters Tahoma can't render (would show
    as ▢ boxes). Covers most BMP+SMP emoji ranges."""
    if not text:
        return text
    out = []
    for ch in text:
        cp = ord(ch)
        # Common emoji blocks: drop them outright
        if 0x1F300 <= cp <= 0x1FAFF:   # Misc Symbols & Pictographs, Emoticons, Transport, Supplemental
            continue
        if 0x2600 <= cp <= 0x27BF:     # Miscellaneous Symbols + Dingbats
            continue
        if 0x2300 <= cp <= 0x23FF:     # Misc Technical (▶ ⏸ etc)
            continue
        if 0x2B00 <= cp <= 0x2BFF:     # Misc Symbols and Arrows
            continue
        if cp == 0xFE0F or cp == 0x200D:  # variation selector / ZWJ
            continue
        out.append(ch)
    return "".join(out)


def inline(text):
    """Convert markdown inline syntax to reportlab paragraph mini-HTML."""
    text = strip_emoji(text)
    # bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # inline code
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" color="#9333ea">\1</font>', text)
    # markdown links → text only (PDF links need anchor tag handling)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return text


def parse_table(lines, start):
    """Parse a markdown table starting at lines[start]. Returns (table_data, end_idx)."""
    rows = []
    i = start
    while i < len(lines) and "|" in lines[i]:
        line = lines[i].strip()
        if not line.startswith("|"):
            break
        # Skip separator row (---|---)
        if re.match(r"^\|[\s\-:|]+\|?$", line):
            i += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        i += 1
    return rows, i


def flow_from_markdown(md_path):
    """Convert a markdown file to a list of reportlab Flowable objects."""
    text = Path(md_path).read_text(encoding="utf-8")
    lines = text.split("\n")
    flow = []
    i = 0
    in_code = False
    code_buf = []
    in_quote = False
    quote_buf = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Code fence
        if stripped.startswith("```"):
            if in_code:
                # Closing — flush
                code_text = "\n".join(code_buf).replace("\n", "<br/>")
                flow.append(Paragraph(code_text, S["code"]))
                code_buf = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
            i += 1
            continue

        # Blockquote (>)
        if stripped.startswith(">"):
            quote_buf.append(stripped.lstrip(">").strip())
            in_quote = True
            i += 1
            continue
        if in_quote:
            flow.append(Paragraph(inline(" ".join(quote_buf)), S["blockquote"]))
            quote_buf = []
            in_quote = False

        # Headings
        if stripped.startswith("# "):
            flow.append(Paragraph(inline(stripped[2:]), S["h1"]))
            i += 1
            continue
        if stripped.startswith("## "):
            flow.append(Paragraph(inline(stripped[3:]), S["h2"]))
            i += 1
            continue
        if stripped.startswith("### "):
            flow.append(Paragraph(inline(stripped[4:]), S["h3"]))
            i += 1
            continue

        # Horizontal rule
        if stripped in ("---", "___", "***"):
            flow.append(Spacer(1, 4))
            i += 1
            continue

        # Table
        if stripped.startswith("|") and "|" in stripped[1:]:
            rows, end = parse_table(lines, i)
            if rows:
                # Wrap each cell content in a Paragraph for proper word wrap
                rendered = []
                for r_idx, row in enumerate(rows):
                    style = S["body"] if r_idx > 0 else ParagraphStyle(
                        "th", parent=S["body"], fontName=FONT_BOLD,
                        textColor=colors.white, fontSize=10.5,
                    )
                    rendered.append([Paragraph(inline(c), style) for c in row])
                tbl = Table(rendered, hAlign="LEFT", repeatRows=1)
                # Simple monochrome table: dark header strip, hairline
                # bottom borders only, no vertical lines. Cleaner read.
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#111827")),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]))
                flow.append(Spacer(1, 4))
                flow.append(tbl)
                flow.append(Spacer(1, 8))
            i = end
            continue

        # Bullet
        if re.match(r"^\s*[-*]\s+", stripped):
            content = re.sub(r"^\s*[-*]\s+", "", stripped)
            flow.append(Paragraph(f"• {inline(content)}", S["bullet"]))
            i += 1
            continue

        # Numbered list
        m = re.match(r"^\s*(\d+)\.\s+(.*)$", stripped)
        if m:
            flow.append(Paragraph(f"{m.group(1)}. {inline(m.group(2))}", S["bullet"]))
            i += 1
            continue

        # Empty line
        if not stripped:
            flow.append(Spacer(1, 4))
            i += 1
            continue

        # Plain paragraph
        flow.append(Paragraph(inline(stripped), S["body"]))
        i += 1

    # Flush trailing buffers
    if in_quote and quote_buf:
        flow.append(Paragraph(inline(" ".join(quote_buf)), S["blockquote"]))
    if in_code and code_buf:
        flow.append(Paragraph("<br/>".join(code_buf), S["code"]))

    return flow


# ─── Build PDF ──────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Datacomets — Bot Capabilities",
        author="Datacomets ICT",
    )

    flow = []
    # Cover — minimal
    flow.append(Spacer(1, 6 * cm))
    flow.append(Paragraph("Datacomets Workspace", ParagraphStyle(
        "cover_sub", fontName=FONT, fontSize=11, textColor=colors.HexColor("#6b7280"),
        alignment=1, spaceAfter=12,
    )))
    flow.append(Paragraph("ความสามารถของบอท AI", ParagraphStyle(
        "cover_title", fontName=FONT_BOLD, fontSize=28, textColor=colors.HexColor("#111827"),
        alignment=1, spaceAfter=8,
    )))
    flow.append(Paragraph("Bot Capabilities", ParagraphStyle(
        "cover_eng", fontName=FONT, fontSize=14, textColor=colors.HexColor("#9ca3af"),
        alignment=1, spaceAfter=30,
    )))
    flow.append(Paragraph("IT-Ticket  ·  Meeting Rooms",
                         ParagraphStyle("cover_desc", fontName=FONT, fontSize=11,
                                        textColor=colors.HexColor("#6b7280"),
                                        alignment=1, spaceAfter=60)))
    flow.append(Paragraph("พฤษภาคม 2026", ParagraphStyle(
        "cover_date", fontName=FONT, fontSize=10, textColor=colors.HexColor("#9ca3af"),
        alignment=1,
    )))
    flow.append(PageBreak())

    # TOC — minimal
    flow.append(Paragraph("สารบัญ", S["h1"]))
    flow.append(Spacer(1, 8))
    flow.append(Paragraph("1.   IT-Ticket Chatbot", S["body"]))
    flow.append(Paragraph("       AI ผู้ช่วยเปิด ticket — ใช้ AI 4 ตัวเรียงลำดับ", S["body"]))
    flow.append(Spacer(1, 6))
    flow.append(Paragraph("2.   Meeting Rooms Bot", S["body"]))
    flow.append(Paragraph("       AI ผู้ช่วยสรุปประชุม — ใช้ AI 3 ชั้นเรียงลำดับ", S["body"]))
    flow.append(PageBreak())

    # Content
    for src in SOURCES:
        flow.extend(flow_from_markdown(src))
        flow.append(PageBreak())

    doc.build(flow)
    print(f"OK Generated: {OUT}")
    print(f"   Size: {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    build()
