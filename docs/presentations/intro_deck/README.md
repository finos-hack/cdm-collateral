# Intro deck: CDM collateral prototype

Nine-slide introduction for collateral SMEs and potential partners (task `task-presentation`, goal `goal-adoption`).

| File | Content |
|---|---|
| `intro_deck.pdf` | Rendered deck, one 1920×1080 page per slide, speaker notes omitted |
| `deck.json` | Slide order, sections and typefaces |
| `slides/<id>.html` | One slide per file: a single `<section>` with inline styles; speaker notes in the trailing `<aside>` |
| `render_pdf.py` | Regenerates `intro_deck.pdf` from `deck.json` and `slides/` |
| `build_site.mjs` | Generates `docs/index.html` (the deck as a web page) and `docs/sme-questions.html` (every question of `docs/analysis/sme-question-ledger.md`) |

**This directory is the source of the deck** (project owner, 2026-11-13). Edit `slides/<id>.html` and `deck.json`
here, then regenerate the PDF. The files are in the Claude Slides artifact format. The deck began as the artifact
https://claude.ai/artifact/1E2ZqCEhEoCbx73LRo1SUa (copied here on 2026-11-10 from version `1794230093-92bc`); that
artifact is no longer maintained and is out of date since the update of 2026-11-13 (`gaps`, `sme`, `besu`, `app`
and `coverage` slides to the figures of `main` after PR #66).

## The web page: `docs/index.html`

The deck is published as `docs/index.html`, with `docs/sme-questions.html` beside it. Both are generated; do not
edit them. After a change to the slides, `deck.json` or the SME question ledger, run:

```sh
node docs/presentations/intro_deck/build_site.mjs
```

In the page, the arrow keys, Space, Page Up and Page Down move between slides, and N shows the speaker notes. The bar
at the bottom links the gap register, the SME questions and the PDF. Links in the slides are relative to `docs/`.

## Regenerating the PDF

```sh
npm i @fontsource-variable/space-grotesk @fontsource/ibm-plex-sans   # in a scratch directory
mkdir -p /tmp/fonts && cp node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2 \
  node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-{400,600}-normal.woff2 /tmp/fonts/
python3 docs/presentations/intro_deck/render_pdf.py /tmp/fonts   # set CHROME=/path/to/chrome if Playwright has no browser
```
