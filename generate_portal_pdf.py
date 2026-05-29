"""Convert Portal_Analysis.md to a polished PDF (Thai font + tables + code)."""
import markdown
from playwright.sync_api import sync_playwright
from pathlib import Path

ROOT = Path(__file__).parent
MD = ROOT / "Portal_Analysis.md"
PDF = ROOT / "Portal_Analysis.pdf"

CSS = """
@page { size: A4; margin: 14mm 14mm; }
body {
  font-family: 'Sarabun','Noto Sans Thai','Segoe UI',Tahoma,sans-serif;
  font-size: 10.5pt; line-height: 1.5; color: #1e293b;
  margin: 0;
}
h1 {
  font-size: 22pt; color:#1e40af;
  border-bottom: 3px solid #3b82f6;
  padding-bottom: 8px; margin: 0 0 12px;
  page-break-after: avoid;
  letter-spacing: -0.3px;
}
h2 {
  font-size: 15pt; color:#1e3a8a;
  border-bottom: 1px solid #bfdbfe;
  padding-bottom: 4px;
  margin: 20px 0 8px;
  page-break-after: avoid;
}
h3 {
  font-size: 12.5pt; color:#1e40af;
  margin: 14px 0 5px;
  page-break-after: avoid;
}
h4 {
  font-size: 11pt; color:#334155;
  margin: 10px 0 4px;
  page-break-after: avoid;
}
p { margin: 4px 0; }
ul, ol { margin: 4px 0; padding-left: 22px; }
li { margin: 2px 0; }
strong { color: #0f172a; font-weight: 700; }
em { color: #64748b; font-style: italic; }
blockquote {
  border-left: 3px solid #3b82f6;
  background: #eff6ff;
  padding: 6px 12px;
  margin: 8px 0;
  color: #1e3a8a;
  border-radius: 0 4px 4px 0;
  font-size: 10pt;
}
blockquote p { margin: 2px 0; }
code {
  font-family: 'JetBrains Mono','Consolas','Courier New',monospace;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9.5pt;
  color: #be185d;
}
pre {
  font-family: 'JetBrains Mono','Consolas','Courier New',monospace;
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 8.5pt;
  line-height: 1.35;
  white-space: pre;
  overflow-x: visible;
  margin: 8px 0;
  page-break-inside: avoid;
}
pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #cbd5e1;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #1e40af;
  color: #fff;
  font-weight: 600;
}
tr:nth-child(even) td { background: #f8fafc; }
td code {
  font-size: 9pt;
  color: #be185d;
}
hr {
  border: none;
  border-top: 1px dashed #cbd5e1;
  margin: 14px 0;
}
a { color: #2563eb; text-decoration: none; }

/* Cover-page-ish first heading */
body > h1:first-child {
  text-align: center;
  padding: 20px 0 14px;
  border: none;
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 6px;
}
body > h1:first-child + p {
  text-align: center;
  font-size: 13pt;
  color: #475569;
  margin: 0 0 4px;
}
body > h1:first-child + p + p {
  text-align: center;
  color: #94a3b8;
  font-size: 10.5pt;
  margin: 0 0 18px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 14px;
}
"""

HTML_TMPL = """<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Portal Analysis</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""


def main():
    md_text = MD.read_text(encoding="utf-8")
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists"],
    )
    html = HTML_TMPL.format(css=CSS, body=body)

    tmp_html = ROOT / "_portal_tmp.html"
    tmp_html.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.goto(f"file:///{tmp_html.as_posix()}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(400)
        page.pdf(
            path=str(PDF),
            format="A4",
            margin={"top": "14mm", "right": "14mm", "bottom": "14mm", "left": "14mm"},
            print_background=True,
        )
        browser.close()

    tmp_html.unlink(missing_ok=True)
    print(f"[OK] PDF generated: {PDF}")


if __name__ == "__main__":
    main()
