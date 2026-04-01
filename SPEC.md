# Better Markdown — Spec

## Overview

A VSCode extension that replaces the default markdown editor with a Notion-like WYSIWYG block editor. Opens automatically for all `.md` files — no activation command needed.

## Core Features

### Rich Block Editing (via BlockNote)

- Block-based editing with drag handles to reorder
- Slash menu (`/`) for inserting block types (headings, lists, code, quotes, etc.)
- Inline formatting toolbar (bold, italic, code, links, colors)
- Markdown round-trip: file on disk is always valid `.md`

### Sticky Headings

- When you scroll past a heading, it pins to the top of the editor
- Respects hierarchy: if you're under an H2 inside an H1, both show
- Clicking a sticky heading scrolls back to that section

### Collapsible Sections

- Toggle arrow (▶/▼) next to each heading
- Collapses all content between that heading and the next heading of same/higher level
- Collapse state is per-editor session (not persisted in the file)

### Multi-Editor Support

- Open the same `.md` file in split view — both editors stay synced
- Open multiple different `.md` files side by side
- Each gets its own independent BlockNote instance

### Theme Integration

- Matches VSCode's active color theme via CSS variables
- Dark/light mode handled automatically

## Architecture

```
VSCode Extension Host (Node.js)
├── CustomTextEditorProvider
│   ├── TextDocument = source of truth (the .md file)
│   ├── Creates webview per editor tab
│   └── Bidirectional sync: TextDocument ↔ webview postMessage
│
Webview (Browser, React)
├── BlockNote editor (ProseMirror/TipTap under the hood)
├── Markdown ↔ Blocks conversion (BlockNote built-in)
├── Sticky headings overlay (IntersectionObserver)
└── Collapsible sections (DOM toggle, CSS transitions)
```

## Sync Protocol

|                |                                   |                                                      |
| -------------- | --------------------------------- | ---------------------------------------------------- |
|                |                                   |                                                      |
| Direction      | Trigger                           | Message                                              |
| Host → Webview | File opened                       | `{ type: "init", content: "# markdown..." }`         |
| Host → Webview | External edit (git, other editor) | `{ type: "update", content: "..." }`                 |
| Webview → Host | User types/edits                  | `{ type: "edit", content: "..." }` (debounced 300ms) |
| Webview → Host | Webview loaded                    | `{ type: "ready" }`                                  |

## File Structure

```
better-markdown/
├── package.json          # Extension manifest + deps
├── tsconfig.json         # Extension host TS config
├── esbuild.js            # Dual build (extension + webview)
├── scripts/deploy.sh     # Build + package + optional publish
├── src/
│   ├── extension.ts      # Activation (registers provider)
│   └── provider.ts       # CustomTextEditorProvider
├── webview/
│   ├── tsconfig.json     # Webview TS config (JSX)
│   ├── index.tsx          # React mount
│   ├── App.tsx            # BlockNote editor + sync
│   ├── hooks/useVSCodeSync.ts
│   ├── components/StickyHeadings.tsx
│   └── styles/editor.css
└── .vscode/
```
├── launch.json       # F5 to test
└── tasks.json
```
```

## Dependencies

|                      |                                            |
| -------------------- | ------------------------------------------ |
|                      |                                            |
| Package              | Purpose                                    |
| `@blocknote/core`    | Editor engine                              |
| `@blocknote/react`   | React bindings + hooks                     |
| `@blocknote/mantine` | Themed UI components (BlockNoteView)       |
| `@mantine/core`      | UI library (required by blocknote/mantine) |
| `react`, `react-dom` | UI framework                               |
| `esbuild`            | Bundler                                    |
| `@vscode/vsce`       | Extension packaging                        |
| `typescript`         | Type checking                              |

## Build & Deploy

```bash
# Development
npm install
npm run build        # One-time build
npm run watch        # Watch mode

# Test in VSCode
# Press F5 (launches Extension Development Host)

# Package & publish
./scripts/deploy.sh              # Creates .vsix
./scripts/deploy.sh --publish    # Publishes to marketplace
```

## Requirements & Formatting Rules

### Editor Behavior

- Editor must be scrollable with styled scrollbar
- Status bar at top shows loading/parsing state and errors
- "Open in Default Editor" link above first content block in rich mode
- "Open in Rich Editor" CodeLens above line 1 in source mode
- Toggle between rich/source via Cmd+Shift+M, editor title icon, or in-editor links
- Sticky headings: pin to top on scroll, respect hierarchy, fully opaque background
- Clicking a sticky heading scrolls to exact heading position (offset for sticky bar height)
- Headings in rich mode have extra top margin for breathing room

### Links

- Cmd+click / Ctrl+click / middle-click opens links
- BlockNote's "open in new tab" toolbar button routes through extension host
- Relative .md links open in VSCode; external URLs open in browser

### Images

- Relative image paths resolve to webview URIs for display
- On save, webview URI prefixes are stripped to restore original relative paths
- Handles both `vscode-webview://` and \`\` schemes
- Image captions (alt text) preserved: input via `<figure>/<figcaption>` conversion, output via `<figcaption>` stripping so `alt` alone produces `![caption](url)`
- Duplicate captions stripped in post-processing (BlockNote outputs caption as both alt and figcaption)
- Default "BlockNote image" alt text stripped on export

### Code Blocks

- No syntax highlighting colors in code blocks (plain monospace text)
- Inline code retains its styling
- Shiki WASM enabled via `wasm-unsafe-eval` CSP directive
- Code blocks without a language default to `text`
- `shellscript` language name normalized to `bash`

### Markdown Formatting (see `webview/markdown.config.ts`)

- Bullet points: `- `(dash + single space), not `* `with 3 spaces
- Ordered lists: `1. `(single space after dot), not `1. `with two
- Italics: `_underscores_`, not `*stars*` — emphasis conversion skips code blocks, inline code, and standalone `*` (math expressions like `γ * λ` preserved)
- Bold: `**double stars**`
- Code blocks: always fenced with triple backticks, never indented
- Horizontal rules: `---`
- List indent: single space after marker
- All formatting controlled via `webview/markdown.config.ts`

### Tables

- BlockNote has no header row concept — header content appears as first data row
- On export, empty header rows inserted by rehype-remark are detected and removed; first data row promoted to header
- Separator row (`| --- |`) dashes match column widths from data rows
- Existing separator rows rebuilt to match column widths

### Headings

- h1-h3 fully supported
- h4-h6 downgraded to h3 on load (BlockNote limitation — only supports 3 levels)
- Headings rendered with explicit bold (`font-weight: 700`) and extra top margin

### Sync

- Counter-based echo suppression prevents sync loops (no table row duplication)
- Edits from webview never echo back to the editor
- Only truly external changes (git, other editors) update the webview
- Debounced at 300ms to avoid thrashing

### Task Lists (Checkboxes)

- Input: `<ul class="contains-task-list">` converted to BlockNote's native `<div data-content-type="checkListItem" data-checked="true/false">` format WITHOUT `<p>` wrapper (content spec is `inline*`)
- This avoids BlockNote's double-parse bug where both `<input>` and `<li>` rules fire
- Output: checkListItem divs converted back to `<ul><li><input type="checkbox">` via DOMParser before rehype-remark
- `normalizeMarkdown` merges bare checkbox lines with next non-empty content line and removes blank lines between consecutive task items
- Escaped brackets (`\[ ]`, `\[x]`) are unescaped

### Markdown Parsing Pipeline

- Input: markdown → remark/rehype → HTML → sanitize (h4-h6 downgrade, task list native format, `<p>` stripping in `<li>`, code block language, image figcaptions, relative path resolution) → `tryParseHTMLToBlocks`
- Output: `blocksToHTMLLossy` → strip figcaptions/figure wrappers → convert checkListItem divs to `<ul><li>` → rehype-remark with controlled stringify options → `normalizeMarkdown` post-processing → strip webview URI prefixes
- Fallback: if custom pipeline fails, uses BlockNote's built-in `blocksToMarkdownLossy` + `normalizeMarkdown`
- Note: `fence` and `rule` in remark-stringify take a single character (`` ` `` and `-`), not the full string

### Metadata Preservation

- H4-h6 heading levels stored in `<!-- better-markdown-meta {...} -->` comment at bottom of file
- Keyed by heading text (not line number) — survives content edits and reordering
- On save, `###` headings restored to original `####`/`#####`/`######` levels
- Meta block stripped before BlockNote parses, re-appended after serialization

## Known Limitations

- h4-h6 headings visually render as h3 in rich editor (restored on save via metadata)
- Image captions shown in rich editor but can accumulate on malformed round-trips
- Some exotic markdown (raw HTML blocks, footnotes) may not round-trip perfectly
- YAML frontmatter needs special handling (future enhancement)
- First load has a brief flash while BlockNote initializes
- Webview bundle is ~2MB compressed due to ProseMirror + Mantine + shiki
- No git diff integration in rich editor (use "Open in Default Editor" toggle)
- No Ctrl+F find-in-page in rich editor yet
- Updates suppressed when editor panel is not visible (prevents conflicts)
