# Better Markdown — Spec

## Overview

A VSCode extension that replaces the default markdown editor with a Notion-like WYSIWYG block editor. Opens automatically for all `.md` files — no activation command needed.

## Core Features

### Rich Block Editing (via Tiptap)

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
- Each gets its own independent Tiptap instance

### Theme Integration

- Matches VSCode's active color theme via CSS variables
- Dark mode with lowlight syntax highlighting in code blocks

### Copy as Markdown

- Cmd+C / Ctrl+C on a selection puts markdown source on the clipboard
  (not Tiptap's rendered plain text). Both `text/plain` (markdown) and
  `text/html` (HTML) are set, so rich paste targets still see structure.
- Cut (Cmd+X) does the same and removes the selection.

### Read-Only for Non-File URIs

- Documents from git:, conflictResolution:, and similar non-file schemes
  render as a read-only Tiptap view with a "Read-only" badge.
- Git diff side panes get the full rich rendering on both sides.

### Settings Panel

- Gear icon in the top-right opens a modal settings panel.
- Every normalization step (`compactLists`, `unescapeSpecialChars`,
  `renumberOrderedLists`, `shellscriptToBash`, `fixTableHeaders`,
  `dedupImageAltText`) is independently toggleable.
- Serializer markers (bullet, italic, bold, rule, list indent) and the
  default code-block language label are configurable.
- Settings persist in VSCode's globalState and sync across open panels.

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
├── Tiptap editor (ProseMirror under the hood)
├── Markdown ↔ HTML conversion
│   ├── Input: remark/rehype pipeline (md → HTML → Tiptap)
│   └── Output: Tiptap HTML → rehype-remark → normalizeMarkdown
├── SearchBar (CSS Custom Highlight API)
├── Sticky headings overlay (IntersectionObserver)
├── Table of contents sidebar (resizable, filterable)
└── Shared utils (getHeadingLevel, scrollToBlock)
```

## Sync Protocol

| Direction      | Trigger                           | Message                                                                       |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Host → Webview | File opened                       | `{ type: "init", content, baseUri, docFolderPath, isReadonly, settings }`     |
| Host → Webview | External edit (git, other editor) | `{ type: "update", content: "..." }`                                          |
| Host → Webview | Ctrl+F pressed                    | `{ type: "openSearch" }`                                                      |
| Host → Webview | Another panel saved settings      | `{ type: "settingsUpdated", settings }`                                       |
| Webview → Host | User types/edits                  | `{ type: "edit", content: "..." }` (debounced 300ms)                          |
| Webview → Host | Webview loaded                    | `{ type: "ready" }`                                                           |
| Webview → Host | Toggle editor                     | `{ type: "toggleEditor" }`                                                    |
| Webview → Host | Open link                         | `{ type: "openLink", href: "..." }`                                           |
| Webview → Host | Settings changed                  | `{ type: "saveSettings", settings }`                                          |

## File Structure

```
better-markdown/
├── package.json              # Extension manifest + deps
├── tsconfig.json             # Extension host TS config
├── esbuild.js                # Dual build (extension + webview)
├── scripts/
│   ├── deploy.sh             # Build + package + optional publish
│   ├── pipeline.ts           # Shared md↔md round-trip used by tests
│   ├── test-conversions.ts   # 95+ targeted conversion assertions
│   └── test-roundtrip.ts     # Full-file round-trip test
├── src/
│   ├── extension.ts          # Activation, commands, keybindings
│   └── provider.ts           # CustomTextEditorProvider + settings persistence
├── webview/
│   ├── tsconfig.json         # Webview TS config (JSX)
│   ├── index.tsx             # React mount
│   ├── App.tsx               # Tiptap editor + sync + search + copy + settings
│   ├── settings.ts           # User settings schema + defaults
│   ├── utils.ts              # Shared helpers (getHeadingLevel, scrollToBlock)
│   ├── metadata.ts           # h4-h6 preservation via HTML comments
│   ├── markdown.config.ts    # buildMarkdownConfig + normalizeMarkdown
│   ├── hooks/
│   │   └── useVSCodeSync.ts  # md ↔ html conversion (async + sync variants)
│   ├── components/
│   │   ├── SearchBar.tsx     # Content search (Ctrl+F)
│   │   ├── SettingsPanel.tsx # Settings modal (gear icon)
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
3. `protectTableCodePipes()` — replace `|` inside code spans in table rows with placeholder (remark's GFM table parser splits on `|` even inside backticks)
4. `unified().use(remarkParse, remarkGfm, remarkRehype, rehypeStringify)` → HTML, then restore placeholders
5. DOMParser transforms: wrap bare `<li>` text in `<p>` (Tiptap needs block content), convert GFM task list HTML to Tiptap taskItem format, split multiple `<img>` in same `<p>` into separate blocks
6. Trim code block trailing newlines, resolve relative image paths
7. `editor.commands.setContent(html)` → Tiptap editor

### Output (editor → markdown)

1. `editor.getHTML()` → HTML
2. DOMParser transforms: convert Tiptap taskItem back to GFM `<input type="checkbox">`, escape bare `|` in `<code>` within table cells (leaves `\|` alone via negative lookbehind)
3. Strip `<p>` from `<li>` (tight lists), wrap bare `<img>` in `<p>`
4. `unified().use(rehypeParse, rehypeRemark, remarkGfm, remarkStringify)` → markdown
5. `normalizeMarkdown()` post-processing:
   - `shellscript` language label → `bash`
   - `*` list markers → `-`
   - Ordered list renumbering
   - Table header reconstruction (with code-span-aware cell splitting)
   - Unescape `\~`, standalone `\*`, `\_` in words, `\[`
   - Task list checkbox fixing
   - Image followed by duplicate alt-text line → dedup
   - Compact lists (remove blank lines between items)
   - Orphaned list marker merging
6. `&#x20;` / `&amp;` HTML entity cleanup
7. `restoreHeadings()` converts `### ` back to `####`/`#####`/`######` using metadata
8. `appendMeta()` adds metadata comment at end of file
9. Strip webview URI prefixes to restore relative image paths

## Known Limitations

- **Escaped markdown characters** (`\*`, `\_`) lose backslash on round-trip (Tiptap stores rendered text)
- **`β\_kl` not unescaped**: Unicode chars don't match `\w` in the unescape regex
- Raw HTML blocks and footnotes may not round-trip perfectly
- YAML frontmatter not handled
- No git diff integration in rich editor
- Webview bundle ~380KB compressed

## Testing

```bash
npm test                          # Run round-trip test (test.md)
npx tsx scripts/test-roundtrip.ts # Same, explicit
npx tsx scripts/test-roundtrip.ts path/to/file.md  # Test specific file
```

The round-trip test exercises the remark/rehype pipeline and `normalizeMarkdown` without needing a browser. It catches formatting regressions but cannot test Tiptap-specific behavior.
