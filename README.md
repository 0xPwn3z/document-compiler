# Document Compiler

[![CI](https://github.com/0xPwn3z/document-compiler/actions/workflows/ci.yml/badge.svg)](https://github.com/0xPwn3z/document-compiler/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue.svg)](pyproject.toml)

**Edit Word templates as Markdown. Export DOCX files that still look exactly like the template.**

Document Compiler is a local web tool for document workflows where the *template* is sacred — pre-engagement letters, statements of work, branded proposals — but the *content* changes on every engagement. It converts a `.docx` template into a Markdown mirror, lets you (or an LLM) edit that mirror as plain text, and exports a DOCX built on top of the untouched original template.

No Word automation, no document rebuilt from scratch, no broken branding.

## Why

Rebuilding a DOCX from Markdown (Pandoc-style) loses the template: section setup, headers and footers, styles, relationships, table formatting. Document Compiler takes the opposite approach — the template is never regenerated, only *reused*:

- every editable paragraph and table is bound to the template through a stable `dc:block` marker carried inside the Markdown itself;
- export opens the original template and updates matched blocks **in place**;
- blocks you did not edit are left **byte-for-byte identical** to the template (verified by tests down to the XML level), so drawings, bookmarks, hyperlinks and per-run formatting survive untouched;
- new blocks are created using the template's own style set.

## Features

- **Template-aware Markdown mirror** — headings, paragraphs, lists, simple tables, inline emphasis and page breaks, each with a stable block marker
- **High-fidelity export** — sections, margins, headers/footers, styles and relationships are preserved because the original template is the starting point
- **Marker-safe find & replace** — built-in search never touches structural markers, no matter what you search for (`Ctrl+F`, `Enter`/`Shift+Enter` to navigate, replace one or all)
- **Live structural preview** while you type, with debounced autosave
- **LLM-friendly** — the working document is plain Markdown, so any model can rewrite content without touching Word XML
- **Local by design** — a single-machine server bound to `127.0.0.1`, no accounts, no telemetry; your documents never leave the workspace

## Quick start

Requires Python 3.11+ and Node.js 18+ (the UI is built with Vite).

```bash
git clone https://github.com/0xPwn3z/document-compiler.git
cd document-compiler
python -m pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python -m app.main
```

Then open <http://127.0.0.1:8765>.

To keep generated documents outside the project folder:

```powershell
$env:DOC_COMPILER_DATA = 'D:\DocumentCompilerData'
python -m app.main
```

## Usage

1. **Import** — drag a `.docx` template (max 50 MB) onto the landing page.
2. **Edit** — work on the Markdown mirror. Markers such as
   `<!-- dc:block {"id":"b00001","style":"Heading 1"} -->`
   bind each block to its template paragraph; keep them in place and edit the text between them. Blocks without a marker are treated as new content.
3. **Export** — download a DOCX produced from the original template, with only your edits applied.

The interface is in Italian.

### Find & replace

Press `Ctrl+F` inside the editor. Structural markers are always excluded from matching, so replacing `id` or `style` cannot corrupt the block metadata.

## How it works

```
template.docx ──import──▶ working.md (+ manifest.json)
                              │ edit (human or LLM)
                              ▼
template.docx ──export──▶ export.docx   (template reused, content updated in place)
```

`app/converter.py` walks the template body and emits one marker per paragraph/table, recording its id, Word style and role. On export the same ids are used to locate the original XML elements; unchanged blocks are skipped entirely, edited blocks are rebuilt with their original run properties (colours, sizes and fonts are kept; bold/italic/underline follow the Markdown), and new content is styled from the template's style set.

**Not yet reliable surfaces** (preserved when untouched, but not editable through Markdown): text boxes and floating shapes, complex content controls, tracked changes, advanced fields.

## Project layout

```
app/
  main.py        HTTP server (localhost only, serves the built SPA)
  converter.py   DOCX <-> Markdown conversion and template-aware export
  store.py       project persistence (data/projects/<id>/…)
frontend/        React + TypeScript SPA (Vite, vitest, eslint)
tests/           Python unittest suite
data/            your documents — gitignored, never published
DESIGN.md        the UI design system (Notion-style)
```

## Development

```bash
python -m pip install -r requirements.txt -r requirements-dev.txt

python -m unittest discover -s tests -v               # Python suite
ruff check app tests                                  # lint

# frontend (see below)
cd frontend && npm ci && npm run lint && npm test && npm run build
```

CI runs the Python suite on Python 3.11–3.14 (Linux and Windows) plus ruff, and the frontend suite (lint, vitest, build) on Node 22, on every push and pull request.

### Frontend (React + TypeScript)

The UI is a Vite + React SPA in [`frontend/`](frontend). Build it with `npm run build`; the Python server serves the generated `frontend/dist` and refuses to start without it (the build is part of the quick start above).

```bash
cd frontend
npm install
npm run dev      # dev server on :5173, proxies /api to :8765
npm run build    # type-check (strict TS) + production build to frontend/dist
npm run test     # vitest: find & replace, preview renderer, integration
npm run lint     # eslint
```

## Security considerations

- The server binds to `127.0.0.1` and has no authentication: **do not expose it** to untrusted networks (e.g. via port forwarding).
- Documents stay in `data/` (or `DOC_COMPILER_DATA`), which is gitignored — client material must never be committed.
- Uploads are limited to 50 MB and `.docx` files only.

See [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities.

## Roadmap

- Richer OOXML manifest: locators for content controls, bookmarks, numbering, images and fields
- Visual fidelity tests comparing template vs. export rendering
- Versioned autosave and full-text search across projects
- Optional LLM endpoint that operates on a single project's Markdown

## Contributing

Bug reports and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE)
