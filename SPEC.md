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
        ├── launch.json       # F5 to test
        └── tasks.json

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

```shellscript
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

## Known Limitations

- Some exotic markdown (raw HTML blocks, footnotes) may not round-trip perfectly
- YAML frontmatter needs special handling (future enhancement)
- First load has a brief flash while BlockNote initializes
- Webview bundle is ~3MB (production, minified) due to ProseMirror + Mantine
