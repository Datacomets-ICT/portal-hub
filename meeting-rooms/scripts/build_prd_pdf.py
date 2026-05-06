"""
Render docs/PRD.md → docs/PRD.pdf using Python-markdown + headless Edge.

Why Edge headless: avoids installing heavy Puppeteer/Chromium from npm.
Windows ships with Edge; --print-to-pdf is a first-class flag.

Usage:
    python scripts/build_prd_pdf.py
"""

import os
import subprocess
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DOCS = os.path.join(ROOT, 'docs')
MD_PATH = os.path.join(DOCS, 'PRD.md')
HTML_PATH = os.path.join(DOCS, 'PRD.html')
PDF_PATH = os.path.join(DOCS, 'PRD.pdf')

EDGE_CANDIDATES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>PRD — Meeting Rooms</title>
<style>
  @page {{ size: A4; margin: 2cm 2cm 2.2cm; }}
  body {{
    font-family: 'IBM Plex Sans Thai', 'Segoe UI', 'Sarabun', sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #222;
    max-width: 760px;
    margin: 0 auto;
    padding: 0 6px;
  }}
  h1 {{
    color: #c2410c;
    font-size: 22pt;
    font-weight: 700;
    margin: 0 0 8px;
    border-bottom: 2px solid #c2410c;
    padding-bottom: 6px;
    letter-spacing: -0.01em;
  }}
  h2 {{
    color: #333;
    font-size: 15pt;
    margin: 28px 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e5e5;
  }}
  h3 {{
    color: #555;
    font-size: 12.5pt;
    margin: 18px 0 6px;
  }}
  p, li {{ margin: 4px 0; }}
  ul, ol {{ padding-left: 22px; }}
  strong {{ color: #111; }}
  em {{ color: #555; }}
  code {{
    background: #f5f1ea;
    color: #8a2e07;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'IBM Plex Mono', 'Cascadia Mono', monospace;
    font-size: 10pt;
  }}
  pre {{
    background: #f5f1ea;
    padding: 12px 14px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 9.5pt;
    line-height: 1.45;
  }}
  pre code {{ background: transparent; color: #222; padding: 0; }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 10px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }}
  th, td {{
    border: 1px solid #ddd;
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }}
  th {{
    background: #faf6f0;
    color: #333;
    font-weight: 600;
  }}
  tr:nth-child(even) td {{ background: #fcfaf7; }}
  hr {{
    border: 0;
    border-top: 1px solid #e5e5e5;
    margin: 24px 0;
  }}
  blockquote {{
    border-left: 3px solid #c2410c;
    padding: 4px 12px;
    margin: 10px 0;
    color: #555;
    background: #fffaf5;
  }}
  h1 + table {{ margin-top: 12px; }}
</style>
</head>
<body>
{body}
</body>
</html>
"""


def find_edge():
    for p in EDGE_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def main():
    if not os.path.exists(MD_PATH):
        print(f'ERROR: {MD_PATH} not found', file=sys.stderr)
        sys.exit(1)

    with open(MD_PATH, encoding='utf-8') as f:
        md_text = f.read()

    body = markdown.markdown(
        md_text,
        extensions=['tables', 'fenced_code', 'sane_lists', 'nl2br'],
    )
    html = HTML_TEMPLATE.format(body=body)

    with open(HTML_PATH, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'✓ HTML → {HTML_PATH}')

    edge = find_edge()
    if not edge:
        print('ERROR: no Edge/Chrome found on common paths. Skipping PDF.', file=sys.stderr)
        print('You can open PRD.html manually and Ctrl+P → Save as PDF.', file=sys.stderr)
        sys.exit(2)

    file_url = 'file:///' + HTML_PATH.replace('\\', '/')
    cmd = [
        edge,
        '--headless=new',
        '--disable-gpu',
        '--no-pdf-header-footer',
        f'--print-to-pdf={PDF_PATH}',
        file_url,
    ]
    print('Running:', ' '.join(f'"{c}"' if ' ' in c else c for c in cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    if result.returncode != 0:
        print('Edge stderr:', result.stderr[:500], file=sys.stderr)
        sys.exit(result.returncode)
    if not os.path.exists(PDF_PATH):
        print('ERROR: PDF not produced', file=sys.stderr)
        sys.exit(1)
    size_kb = os.path.getsize(PDF_PATH) / 1024
    print(f'✓ PDF  → {PDF_PATH} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
