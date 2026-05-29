"""Convert IT_Ticket_PRD.md to PDF — reuses CSS/settings from generate_workflow_pdf."""
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from generate_workflow_pdf import CSS, HTML_TMPL, convert_mermaid_blocks
import markdown
from playwright.sync_api import sync_playwright

MD = ROOT / "IT_Ticket_PRD.md"
PDF = ROOT / "IT_Ticket_PRD.pdf"


def main():
    md_text = MD.read_text(encoding="utf-8")
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists", "md_in_html"],
    )
    body = convert_mermaid_blocks(body)
    html = HTML_TMPL.format(css=CSS, body=body)

    tmp_html = ROOT / "_prd_tmp.html"
    tmp_html.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.goto(f"file:///{tmp_html.as_posix()}")
        page.wait_for_load_state("networkidle")
        page.wait_for_function("window.__mermaidDone === true", timeout=30000)
        page.wait_for_timeout(500)
        page.pdf(
            path=str(PDF),
            format="A4",
            margin={"top": "12mm", "bottom": "12mm", "left": "12mm", "right": "12mm"},
            print_background=True,
        )
        browser.close()

    tmp_html.unlink(missing_ok=True)
    size_kb = PDF.stat().st_size / 1024
    print(f"OK: {PDF.name} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
