# Better Markdown — Spec

## Overview

A VSCode extension that replaces the default markdown editor with a Notion-like WYSIWYG block editor. Opens automatically for all `.md` files — no activation command needed.

## Core Features

### Rich Block Editing (via Tiptap)

- Block-based editing with drag handles to reorder
- Slash menu (`/`) for inserting block types (headings, lists, code, math, etc.)
- Inline formatting toolbar (bold, italic, code, links, colors)
- Math support — inline (`$...$`) and block (`$$...$$`) rendered via KaTeX with click-to-edit LaTeX source
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

- Cmd+C / Ctrl+C on a selection puts markdown source on the clipboard (not Tiptap's rendered plain text). Both `text/plain` (markdown) and `text/html` (HTML) are set, so rich paste targets still see structure.
- Cut (Cmd+X) does the same and removes the selection.

### Images

- Custom Tiptap NodeView (`webview/extensions/ImageView.tsx`) with inline caption editing.
- Insert via slash menu (`/Image` opens `ImageInsertDialog`), drag-and-drop onto the editor, or paste from clipboard (handled in `useDragDrop.ts`).
- Relative image paths are resolved against the document folder when rendering and stripped back to relative on save.

### CodeLens Entry Points

- When a `.md` file is open in VS Code's native text editor, a CodeLens row at line 1 offers "Open in Rich Editor" and "Open in Browser" actions, so users can switch into the rich view without hunting for the command palette.

### Read-Only for Non-File URIs

- Documents from git:, conflictResolution:, and similar non-file schemes render as a read-only Tiptap view with a "Read-only" badge.
- Git diff side panes get the full rich rendering on both sides.

### Settings Panel

- Gear icon in the top-right opens a modal settings panel.
- Every normalization step (`compactLists`, `unescapeSpecialChars`, `renumberOrderedLists`, `shellscriptToBash`, `fixTableHeaders`, `dedupImageAltText`) is independently toggleable.
- Serializer markers (bullet, italic, bold, rule, list indent) and the default code-block language label are configurable.
- Settings persist in VSCode's globalState and sync across open panels.

### Git Diff View

- **Inline toggle**: "Diff" button (top-right of editor) compares live buffer against HEAD. Uses `vscode.git` extension to fetch HEAD content.
- **Standalone panel**: `betterMarkdown.openDiff` command opens a dedicated rich diff webview between any two URIs. Accessible from:
  - Command palette (Better Markdown: Open Rich Diff)
  - SCM resource context menu (right-click changed .md file)
  - Diff editor toolbar (when a .md diff is active)
- **Two view modes**, switchable in the toolbar:
  - **Source**: line-by-line diff via `diff` + `diff2html` (unified or side-by-side layout, green/red/blue matching git conventions).
  - **Rendered**: word-level HTML diff — both sides rendered via `markdownToDisplayHtml`, then `node-htmldiff` produces `<ins>`/`<del>` markers, styled with green/red highlights. Native GFM task-list checkboxes are preserved.
- **Prev/Next hunk navigation** (Rendered mode only): ↑/↓ buttons in the toolbar with a position counter, plus keyboard shortcuts `j`/`k` / `ArrowUp`/`ArrowDown`. Wraps around at both ends.
- Panel refreshes when either side changes on disk.

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

| Direction      | Trigger                           | Message                                                                   |
| -------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Host → Webview | File opened                       | `{ type: "init", content, baseUri, docFolderPath, isReadonly, settings }` |
| Host → Webview | External edit (git, other editor) | `{ type: "update", content: "..." }`                                      |
| Host → Webview | Ctrl+F pressed                    | `{ type: "openSearch" }`                                                  |
| Host → Webview | Another panel saved settings      | `{ type: "settingsUpdated", settings }`                                   |
| Webview → Host | User types/edits                  | `{ type: "edit", content: "..." }` (debounced 300ms)                      |
| Webview → Host | Webview loaded                    | `{ type: "ready" }`                                                       |
| Webview → Host | Toggle editor                     | `{ type: "toggleEditor" }`                                                |
| Webview → Host | Open link                         | `{ type: "openLink", href: "..." }`                                       |
| Webview → Host | Settings changed                  | `{ type: "saveSettings", settings }`                                      |

## File Structure

```
better-markdown/
├── package.json              # Extension manifest + deps
├── tsconfig.json             # Extension host TS config
├── esbuild.js                # Dual build (extension + webview)
├── assets/                   # Logos, README screenshots/gifs (only logo7.png ships in the vsix)
├── scripts/
│   ├── deploy.sh             # Build + package + optional publish
│   ├── pipeline.ts           # Shared md↔md round-trip used by tests
│   ├── test-conversions.ts   # 113+ targeted conversion assertions
│   └── test-roundtrip.ts     # Full-file round-trip test
├── src/
│   ├── extension.ts          # Activation, commands, keybindings, tab auto-close for non-file URIs
│   ├── diffPanel.ts          # Standalone rich diff webview panel
│   └── provider.ts           # CustomTextEditorProvider + settings persistence
├── webview/
│   ├── tsconfig.json         # Webview TS config (JSX)
│   ├── index.tsx             # React mount (App or DiffApp via __BTRMK_MODE__)
│   ├── App.tsx               # Tiptap editor shell (sync, search, copy, settings, drag/drop)
│   ├── DiffApp.tsx           # Standalone diff panel entry
│   ├── vscode-api.ts         # postMessage wrapper for host ↔ webview
│   ├── settings.ts           # User settings schema + defaults
│   ├── utils.ts              # Shared helpers (getHeadingLevel, scrollToBlock)
│   ├── frontmatter.ts        # YAML frontmatter strip/restore
│   ├── conversion-utils.ts   # DOM/HTML helpers used by the md↔html pipeline
│   ├── markdown.config.ts    # buildMarkdownConfig + normalizeMarkdown
│   ├── hooks/
│   │   ├── useVSCodeSync.ts        # md ↔ html conversion (async + sync variants)
│   │   ├── useEditorState.ts       # Tiptap editor lifecycle + content sync
│   │   ├── useSettingsPanel.ts     # Settings modal open/close + persistence
│   │   ├── useClipboardHandlers.ts # Cmd+C/Cmd+X copy-as-markdown
│   │   └── useDragDrop.ts          # Image paste/drag/drop into editor
│   ├── components/
│   │   ├── DiffView.tsx          # Source/Rendered diff UI (diff2html + htmldiff)
│   │   ├── SearchBar.tsx         # Content search (Ctrl+F)
│   │   ├── SettingsPanel.tsx     # Settings modal (gear icon)
│   │   ├── ImageInsertDialog.tsx # Slash-command image insert dialog
│   │   ├── TableControls.tsx     # Floating add/delete row/col toolbar
│   │   ├── StickyHeadings.tsx
│   │   └── TableOfContents.tsx   # Sidebar + filter
│   ├── extensions/
│   │   ├── SlashCommand.tsx   # `/` block-insert menu
│   │   ├── CodeBlockView.tsx  # Custom NodeView with language selector
│   │   ├── ImageView.tsx      # Custom image NodeView with captions
│   │   ├── MathInline.tsx     # `$...$` inline KaTeX node
│   │   └── MathBlock.tsx      # `$$...$$` block KaTeX node
│   └── styles/
│       └── editor.css
└── test.md                   # Test file used by the round-trip suite
```

## Markdown Output Pipeline

### Input (markdown → editor)

1. `extractFrontmatter()` strips YAML frontmatter (`---` block) from top of file
2. `protectTableCodePipes()` — replace `|` inside code spans in table rows with placeholder (remark's GFM table parser splits on `|` even inside backticks)
3. `unified().use(remarkParse, remarkGfm, remarkMath, remarkRehype, rehypeStringify)` → HTML, then restore placeholders. `remark-math` parses `$...$` / `$$...$$` into math AST nodes; custom `remark-rehype` handlers emit `<span data-type="mathInline">` / `<div data-type="mathBlock">` elements for Tiptap.
4. DOMParser transforms: wrap bare `<li>` text in `<p>` (Tiptap needs block content), convert GFM task list HTML to Tiptap taskItem format, split multiple `<img>` in same `<p>` into separate blocks
5. Trim code block trailing newlines, resolve relative image paths
6. `editor.commands.setContent(html)` → Tiptap editor

### Output (editor → markdown)

1. `editor.getHTML()` → HTML
2. DOMParser transforms: convert Tiptap taskItem back to GFM `<input type="checkbox">`, convert math nodes to code/pre placeholders (protects LaTeX from remark-stringify escaping), escape bare `|` in `<code>` within table cells (leaves `\|` alone via negative lookbehind)
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
6. Restore math from code/pre placeholders back to `$...$` / `$$...$$`
7. `/` `&` HTML entity cleanup
8. `prependFrontmatter()` restores YAML frontmatter at top of file
9. Strip webview URI prefixes to restore relative image paths

> h4–h6 headings round-trip natively via Tiptap's `StarterKit.heading({ levels: [1,2,3,4,5,6] })` — no metadata sidecar is needed (removed in a75d719).

## Claude Code Integration

### Auto-close non-file tabs

When VS Code opens a diff for a `.md` file, the custom editor (priority `"default"`) intercepts both sides. The original-content pane arrives as a `TabInputCustom` with a `git:` or `scm:` URI — read-only and useless in the rich editor. The `onDidChangeTabs` handler in `extension.ts` detects these (`instanceof TabInputCustom`, non-`file` scheme) and closes them on the next tick via `setTimeout`.

### Pre-acceptance rich diff (not yet possible)

Ideally, when Claude Code proposes an edit to an open `.md` file the extension would show a rich diff panel _before_ the user accepts. This is currently blocked because Claude Code writes to disk only **after** the user accepts in the CLI; before that the proposed content lives entirely inside Claude Code's process.

Approaches investigated (Apr 2026):

| Approach                                                              | Result                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Intercept `onDidChangeTabs`                                           | Claude Code opens a `TabInputCustom` (not `TabInputTextDiff`), and only after acceptance — nothing to intercept at proposal time |
| Detect external changes via `onDidChangeTextDocument` in the provider | Works, but fires only post-acceptance — too late for pre-accept review                                                           |
| `FileSystemWatcher` on `.md` files                                    | Same timing: fires after Claude Code writes, i.e. post-acceptance                                                                |

**What would unblock this:** Claude Code exposing a VS Code extension API (event or virtual-document provider) that surfaces the proposed file content before the user accepts. The rich diff panel (`BetterMarkdownDiffPanel`) already accepts arbitrary URI pairs, so wiring it up would be straightforward once the content is available.

## Known Limitations

- **Escaped markdown characters** (`\*`, `\_`) lose backslash on round-trip (Tiptap stores rendered text)
- Raw HTML blocks and footnotes may not round-trip perfectly

## Testing

```bash
npm test                          # Run round-trip test (test.md)
npx tsx scripts/test-roundtrip.ts # Same, explicit
npx tsx scripts/test-roundtrip.ts path/to/file.md  # Test specific file
```

The round-trip test exercises the remark/rehype pipeline and `normalizeMarkdown` without needing a browser. It catches formatting regressions but cannot test Tiptap-specific behavior.
