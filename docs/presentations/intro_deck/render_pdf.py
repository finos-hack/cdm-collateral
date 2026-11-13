"""Render deck.json + slides/*.html to intro_deck.pdf (one 1920x1080 page per slide).

Usage: python3 render_pdf.py <fonts-dir>
<fonts-dir> holds space-grotesk-latin-wght-normal.woff2, ibm-plex-sans-latin-400-normal.woff2 and
ibm-plex-sans-latin-600-normal.woff2 (npm packages @fontsource-variable/space-grotesk and @fontsource/ibm-plex-sans).
Requires Python Playwright with a Chromium browser (set CHROME to a browser binary to use one not installed by Playwright). Speaker notes (<aside>) are not printed.
"""
import json
import os
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
fonts = pathlib.Path(sys.argv[1]).resolve()
deck = json.loads((HERE / "deck.json").read_text())

sections = []
for slide_id in deck["order"]:
    html = (HERE / "slides" / f"{slide_id}.html").read_text()
    html = re.sub(r"<aside>.*?</aside>", "", html, flags=re.S)
    # <x-icon> is a Slides-runtime element; a browser renders it empty, so print an arrow character.
    html = re.sub(r'<x-icon name="ArrowRight"[^>]*>\s*</x-icon>',
                  '<span style="font-size:48px;color:#1F6F8B">&#8594;</span>', html)
    sections.append(html)

page = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: 'Space Grotesk'; src: url('{(fonts / "space-grotesk-latin-wght-normal.woff2").as_uri()}'); font-weight: 300 700; }}
@font-face {{ font-family: 'IBM Plex Sans'; src: url('{(fonts / "ibm-plex-sans-latin-400-normal.woff2").as_uri()}'); font-weight: 400; }}
@font-face {{ font-family: 'IBM Plex Sans'; src: url('{(fonts / "ibm-plex-sans-latin-600-normal.woff2").as_uri()}'); font-weight: 600; }}
@page {{ size: 1920px 1080px; margin: 0; }}
* {{ margin: 0; box-sizing: border-box; }}
section {{ width: 1920px; height: 1080px; position: relative; overflow: hidden; page-break-after: always; }}
ul, ol {{ padding-left: 1.2em; }}
section a {{ color: inherit; text-underline-offset: 4px; }}
</style></head><body>{''.join(sections)}</body></html>"""

out_html = HERE / "_render.html"
out_html.write_text(page)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME"))
    pg = browser.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto(out_html.as_uri())
    pg.evaluate("document.fonts.ready")
    pg.pdf(path=str(HERE / "intro_deck.pdf"), width="1920px", height="1080px", print_background=True)
    browser.close()
out_html.unlink()
print("wrote", HERE / "intro_deck.pdf")
