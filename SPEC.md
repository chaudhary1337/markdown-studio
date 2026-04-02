# Better Markdown — Spec

## Overview

A VSCode extension that replaces the default markdown editor with a Notion-like WYSIWYG block editor. Opens automatically for all `.md` files — no activation command needed.

## Core Features

### Rich Block Editing (via BlockNote)

- Block-based editing with drag handles to reorder
- Slash menu (`/`) for inserting block types (headings, lists, code, etc.)
- Inline formatting toolbar (bold, italic, code, links, colors)
- Markdown round-trip: file on disk is always valid `.md`

### Search

- **Ctrl+F / Cmd+F**: Opens content search bar (anchored to editor top-right)
  - Case-sensitive toggle, regex toggle
  - Navigate matches with Enter/Shift+Enter or arrow buttons
  - Highlights via CSS Custom Highlight API (with `<mark>` fallback)
  - Escape to close
- **TOC filter**: Persistent filter input above table of contents entries
  - Filters headings by text match (case-insensitive)
  - Always visible when TOC is expanded

### Sticky Headings

- When you scroll past a heading, it pins to the top of the editor
- Respects hierarchy: if you're under an H2 inside an H1, both show
- Clicking a sticky heading scrolls back to that section

### Table of Contents

- Auto-generated from all headings in the document
- Highlights the topmost visible heading as active
- Drag-resizable sidebar (min 120px, max 400px, collapse at 80px)
- Entries line-wrap and truncate at 128 characters
- Filter input for searching headings

### Multi-Editor Support

- Open the same `.md` file in split view — both editors stay synced
- Open multiple different `.md` files side by side
- Each gets its own independent BlockNote instance

### Theme Integration

- Matches VSCode's active color theme via CSS variables
- Dark mode with Shiki syntax highlighting in code blocks

## Architecture

```
VSCode Extension Host (Node.js)
├── CustomTextEditorProvider
│   ├── TextDocument = source of truth (the .md file)
│   ├── Creates webview per editor tab
│   ├── Bidirectional sync: TextDocument ↔ webview postMessage
│   └── Search command (Ctrl+F → openSearch message)
│
Webview (Browser, React)
├── BlockNote editor (ProseMirror/TipTap under the hood)
├── Markdown ↔ Blocks conversion
│   ├── Input: remark/rehype pipeline (md → HTML → blocks)
│   └── Output: blocksToMarkdownLossy + normalizeMarkdown
├── SearchBar (CSS Custom Highlight API)
├── Sticky headings overlay (IntersectionObserver)
├── Table of contents sidebar (resizable, filterable)
└── Shared utils (getHeadingLevel, scrollToBlock)
```

## Sync Protocol

| Direction      | Trigger                           | Message                                              |
| -------------- | --------------------------------- | ---------------------------------------------------- |
| Host → Webview | File opened                       | `{ type: "init", content: "# markdown..." }`         |
| Host → Webview | External edit (git, other editor) | `{ type: "update", content: "..." }`                 |
| Host → Webview | Ctrl+F pressed                    | `{ type: "openSearch" }`                             |
| Webview → Host | User types/edits                  | `{ type: "edit", content: "..." }` (debounced 300ms) |
| Webview → Host | Webview loaded                    | `{ type: "ready" }`                                  |
| Webview → Host | Toggle editor                     | `{ type: "toggleEditor" }`                           |
| Webview → Host | Open link                         | `{ type: "openLink", href: "..." }`                  |

## File Structure

```
better-markdown/
├── package.json              # Extension manifest + deps
├── tsconfig.json             # Extension host TS config
├── esbuild.js                # Dual build (extension + webview)
├── scripts/
│   ├── deploy.sh             # Build + package + optional publish
│   └── test-roundtrip.ts     # Automated markdown round-trip test
├── src/
│   ├── extension.ts          # Activation, commands, keybindings
│   └── provider.ts           # CustomTextEditorProvider
├── webview/
│   ├── tsconfig.json         # Webview TS config (JSX)
│   ├── index.tsx             # React mount
│   ├── App.tsx               # BlockNote editor + sync + search
│   ├── utils.ts              # Shared helpers (getHeadingLevel, scrollToBlock)
│   ├── metadata.ts           # h4-h6 preservation via HTML comments
│   ├── markdown.config.ts    # Formatting config + normalizeMarkdown
│   ├── hooks/
│   │   └── useVSCodeSync.ts  # md ↔ blocks conversion pipelines
│   ├── components/
│   │   ├── SearchBar.tsx     # Content search (Ctrl+F)
│   │   ├── StickyHeadings.tsx
│   │   └── TableOfContents.tsx  # Sidebar + filter
│   └── styles/
│       └── editor.css
├── test.md                   # Test file (opened by editor)
└── test-ref.md               # Reference file (never opened, for comparison)
```

## Markdown Output Pipeline

### Input (markdown → editor)

1. `extractMeta()` strips metadata comment from end of file
2. `buildMeta()` scans for h4-h6 headings
3. `unified().use(remarkParse, remarkGfm, remarkRehype, rehypeStringify)` → HTML
4. HTML transforms: h4-h6 → h3, task list → checkListItem, `<p>` stripping in `<li>`, code language sanitization, image figcaption wrapping, relative path resolution
5. `editor.tryParseHTMLToBlocks(html)` → BlockNote blocks

### Output (editor → markdown)

1. Set `language: "text"` on code blocks without a language (forces fenced output)
2. `editor.blocksToMarkdownLossy()` → raw markdown (preserves list nesting)
3. `normalizeMarkdown()` post-processing:
   - `*` list markers → `-`
   - `*text*` emphasis → `_text_`
   - 4-space list indent → 2-space (3-space under ordered parents)
   - Indented code blocks → fenced
   - Ordered list renumbering (BlockNote outputs all as `1.`)
   - Table header reconstruction
   - `\~` unescaping (remark-gfm tilde escaping)
   - Task list checkbox fixing (escaped brackets, orphaned markers)
   - Compact lists (remove blank lines between items)
   - Orphaned list marker merging
   - Duplicate image caption removal
4. `restoreHeadings()` converts `### ` back to `####`/`#####`/`######` using metadata
5. `appendMeta()` adds metadata comment at end of file
6. Strip webview URI prefixes to restore relative image paths

### Fallback

If `blocksToMarkdownLossy` fails, falls back to HTML pipeline:
`blocksToHTMLLossy` → strip figcaptions → strip `<p>` in `<li>` → rehype-remark → remark-stringify

## Known Limitations (BlockNote 0.22.0)

- **Blockquotes not supported** — BlockNote has no blockquote block type; `> text` becomes plain paragraph on load
- **Horizontal rules not supported** — BlockNote has no HR block type; `---` is lost on load
- **h4-h6 render as h3** in editor (restored on save via metadata)
- **Code blocks with 4-space indented content** may lose indented lines (BlockNote parser issue)
- **Escaped markdown characters** (`\*`, `\_`, etc.) lose their backslash on round-trip
- Image captions shown in rich editor but can accumulate on malformed round-trips
- Raw HTML blocks and footnotes may not round-trip perfectly
- YAML frontmatter needs special handling (future)
- Webview bundle is ~2MB compressed (ProseMirror + Mantine + Shiki)
- No git diff integration in rich editor

## Testing

```bash
npm test                          # Run round-trip test (test.md)
npx tsx scripts/test-roundtrip.ts # Same, explicit
npx tsx scripts/test-roundtrip.ts path/to/file.md  # Test specific file
```

The round-trip test exercises the remark/rehype pipeline and `normalizeMarkdown` without needing a browser. It catches formatting regressions but cannot test BlockNote-specific behavior.
