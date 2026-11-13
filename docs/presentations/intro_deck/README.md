# Intro deck: CDM collateral prototype

Nine-slide introduction for collateral SMEs and potential partners (task `task-presentation`, goal `goal-adoption`).

| File | Content |
|---|---|
| `intro_deck.pdf` | Rendered deck, one 1920×1080 page per slide, speaker notes omitted |
| `deck.json` | Slide order, sections and typefaces |
| `slides/<id>.html` | One slide per file: a single `<section>` with inline styles; speaker notes in the trailing `<aside>` |
| `render_pdf.py` | Regenerates `intro_deck.pdf` from `deck.json` and `slides/` |

The source files are in the Claude Slides artifact format. The editable deck is the artifact
https://claude.ai/artifact/1E2ZqCEhEoCbx73LRo1SUa; the copy here was taken on 2026-11-10 from artifact version
`1794230093-92bc`. Edits made in the artifact are not copied here automatically. On 2026-11-13 the `gaps`, `sme`,
`besu`, `app` and `coverage` slides were updated here to the figures of `main` after PR #66 and the PDF re-rendered;
the artifact was not updated, so it now differs from this copy.

## Regenerating the PDF

```sh
npm i @fontsource-variable/space-grotesk @fontsource/ibm-plex-sans   # in a scratch directory
mkdir -p /tmp/fonts && cp node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2 \
  node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-{400,600}-normal.woff2 /tmp/fonts/
python3 docs/presentations/intro_deck/render_pdf.py /tmp/fonts   # set CHROME=/path/to/chrome if Playwright has no browser
```
