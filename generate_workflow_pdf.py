"""Convert IT_Ticket_Workflow.md to PDF with Mermaid diagrams + Thai font."""
import markdown
import re
from playwright.sync_api import sync_playwright
from pathlib import Path

ROOT = Path(__file__).parent
MD = ROOT / "IT_Ticket_Workflow.md"
PDF = ROOT / "IT_Ticket_Workflow.pdf"

CSS = """
@page { size: A4; margin: 12mm 12mm; }
body {
  font-family: 'Sarabun','Noto Sans Thai','Segoe UI',Tahoma,sans-serif;
  font-size: 10.5pt; line-height: 1.4; color: #1e293b;
  margin: 0;
}
h1 { font-size: 20pt; color:#1e40af; border-bottom:2px solid #1e40af;
     padding-bottom:6px; margin:0 0 10px; page-break-after:avoid; }
h2 { font-size: 14pt; color:#1e3a8a; border-bottom:1px solid #dbeafe;
     padding-bottom:3px; margin:14px 0 6px; page-break-after:avoid; }
h3 { font-size: 12pt; color:#1e40af; margin:10px 0 4px; page-break-after:avoid; }
h4 { font-size: 11pt; color:#334155; margin:8px 0 3px; page-break-after:avoid; }
p { margin: 3px 0; }
ul, ol { margin: 3px 0; padding-left: 22px; }
li { margin: 1px 0; }
strong { color:#0f172a; font-weight: 700; }
u { text-decoration: none; font-weight: 600; color: #475569; }
blockquote {
  border-left: 3px solid #3b82f6; background:#eff6ff;
  padding: 4px 10px; margin: 5px 0; color:#1e3a8a;
  border-radius: 0 4px 4px 0;
  font-size: 10pt;
}
blockquote p { margin: 1px 0; }
code {
  font-family: 'JetBrains Mono','Consolas','Courier New',monospace;
  background:#f1f5f9; padding:1px 5px; border-radius:3px;
  font-size: 9.5pt; color:#be185d;
}
pre {
  font-family: 'JetBrains Mono','Consolas','Courier New',monospace;
  background:#0f172a; color:#e2e8f0;
  padding: 8px 10px; border-radius: 5px;
  font-size: 8.5pt; line-height: 1.3;
  white-space: pre; overflow-x: visible;
  margin: 5px 0;
}
pre code { background:transparent; color:inherit; padding:0; font-size:inherit; }

table {
  border-collapse: collapse; width:100%; margin: 5px 0;
  font-size: 10pt; page-break-inside: avoid;
}
th, td {
  border: 1px solid #cbd5e1; padding: 4px 8px; text-align:left;
  vertical-align: top;
}
th { background:#1e40af; color:#fff; font-weight:600; }
tr:nth-child(even) td { background:#f8fafc; }

hr { border:none; border-top:1px dashed #cbd5e1; margin:10px 0; }
a { color:#2563eb; text-decoration:none; }

.form-card {
  background: linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);
  border: 1px solid #7dd3fc;
  border-radius: 6px;
  padding: 6px 14px;
  margin: 6px 0;
}
.form-card ul { margin: 2px 0; padding-left: 20px; }
.form-card li { margin: 1px 0; }

.mockup {
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 12px;
  margin: 6px 0;
}
.mockup table { margin: 4px 0; font-size: 9.5pt; }
.mockup p { margin: 2px 0; }
.mockup p:first-child { margin-top: 0; }
.mockup strong:first-child {
  display:block; font-size: 11pt; color:#1e40af;
  padding-bottom: 3px; margin-bottom: 4px;
  border-bottom: 1px solid #e2e8f0;
}

.mermaid {
  text-align: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px;
  margin: 4px 0;
}
.mermaid svg {
  max-width: 100% !important;
  max-height: 520px !important;
  height: auto !important;
  width: auto !important;
  display: inline-block;
}
"""

HTML_TMPL = """<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>IT Ticket Workflow</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>{css}</style>
</head>
<body>
{body}
<script>
  mermaid.initialize({{
    startOnLoad: false,
    theme: 'default',
    themeVariables: {{
      fontFamily: 'Sarabun, sans-serif',
      fontSize: '12px',
      primaryColor: '#dbeafe',
      primaryTextColor: '#1e3a8a',
      primaryBorderColor: '#1e40af',
      lineColor: '#475569',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#fef3c7'
    }},
    flowchart: {{ htmlLabels: true, curve: 'basis', padding: 8 }},
    securityLevel: 'loose'
  }});
  window.__mermaidDone = false;
  mermaid.run().then(() => {{ window.__mermaidDone = true; }})
               .catch((e) => {{ console.error(e); window.__mermaidDone = true; }});
</script>
</body>
</html>"""


def convert_mermaid_blocks(html: str) -> str:
    """Convert <pre><code class="language-mermaid">...</code></pre> to <div class='mermaid'>"""
    pattern = re.compile(
        r'<pre><code class="language-mermaid">(.*?)</code></pre>',
        re.DOTALL,
    )

    def replace(m):
        import html as html_lib
        code = html_lib.unescape(m.group(1))
        return f'<div class="mermaid">{code}</div>'

    return pattern.sub(replace, html)


def main():
    md_text = MD.read_text(encoding="utf-8")
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists", "md_in_html"],
    )
    body = convert_mermaid_blocks(body)
    html = HTML_TMPL.format(css=CSS, body=body)

    tmp_html = ROOT / "_workflow_tmp.html"
    tmp_html.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.goto(f"file:///{tmp_html.as_posix()}")
        page.wait_for_load_state("networkidle")
        # Wait until all Mermaid diagrams are rendered
        page.wait_for_function("window.__mermaidDone === true", timeout=30000)
        page.wait_for_timeout(500)  # small buffer for SVG layout
        page.pdf(
            path=str(PDF),
            format="A4",
            margin={"top": "18mm", "bottom": "18mm", "left": "15mm", "right": "15mm"},
            print_background=True,
        )
        browser.close()

    tmp_html.unlink(missing_ok=True)
    size_kb = PDF.stat().st_size / 1024
    print(f"OK: {PDF.name} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
