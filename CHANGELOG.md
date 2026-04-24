# Changelog

## 2.2.0 — 2026-04-25

- Feature: Selection bubble menu. Highlight text and a floating toolbar pops up with Bold / Italic / Strike / Inline code / Link buttons plus a "Turn into" dropdown (Text, H1-H6, Quote, Bullet / Numbered / Task list, Code block). Active marks/blocks are highlighted so you can tell what formatting is already applied and click to remove it — no need to delete and retype. Hidden inside code blocks, math, and embeds.
- Feature: Keyboard shortcut to open the bubble menu. Default `Mod+/` (⌘+/ on macOS, Ctrl+/ elsewhere) — if the cursor sits inside a word with no selection, the shortcut expands the selection to that word so the menu has something to anchor to. Customize or disable under Settings → Shortcuts.
- Feature: Keyboard navigation inside the bubble menu. After the open-menu shortcut fires, Arrow Left / Right moves between buttons, Arrow Down on "Turn into" opens the dropdown, Arrow Up / Down navigates dropdown items, Enter activates the focused button/item, Escape returns focus to the editor. The currently focused button gets a focus-colored outline.

## 2.1.x — 2026-04-20

- Feature: Mermaid diagram support. ` ```mermaid ` fences render as live diagrams inline; edit the source and the preview updates. Mermaid is lazy-loaded on first use so docs with no diagrams don't pay the ~1MB bundle cost. On parse errors, the source stays editable and the error is shown underneath. The source pane has a collapse toggle so you can hide the syntax and focus on the diagram. Diagrams scale to fill the preview width instead of rendering at mermaid's intrinsic (often tiny) pixel size. Closes #1.
- Bug fix: Ctrl+S no longer causes the doc to go dirty again after saving. Cause: users with `editor.formatOnSave: true` (a global default for many setups) run VS Code's built-in markdown formatter on save, which mutates the doc content. That mutation fired `onDidChangeTextDocument`, the provider pushed an `update` to the webview, Tiptap's `setContent` fired its own update event, `handleUpdate` re-serialized and sent a fresh `edit` back — creating a save-triggers-dirty loop. Passing `{ emitUpdate: false }` to `setContent` in the external-update branch breaks the loop; the host just told us the content, so there's nothing to echo back.
- Feature: Save the first-open normalization pass silently (default on). When a file is opened, the rich editor applies a md → html → md round-trip; that one pass is now written to disk so users don't see a surprise dirty state or lose the normalization by closing without saving. Every edit after that follows VS Code's own save behavior (`files.autoSave`, Cmd+S, dirty-prompt on close) — we don't debounce-save on your keystrokes. Toggle under Settings → Saving; non-file URIs (git:, vscode-scm:) are still never written. Closes #2.
- Bug fix: Rich editor tabs now stay in sync when hidden. Previously, external changes to a `.md` file (from Claude Code, git operations, format-on-save in the source view, or another editor panel) were dropped while the rich editor tab wasn't focused, so switching back showed a stale view. Combined with `retainContextWhenHidden: true`, the webview now keeps its DOM *and* keeps applying document updates in the background.
- Bug fix: Scrolling past the end of the rich diff view no longer scrolls the editor behind it — `overscroll-behavior: contain` on the diff body stops scroll events from chaining into the underlying markdown file.
- Bug fix: Dragging the Table of Contents handle past the collapse threshold now ends the drag immediately, so the TOC doesn't oscillate / "stick" to the cursor as you keep moving the mouse. Release and start a new drag to reopen.
- Feature: Reopening a file places the cursor where you last left it. First-time opens drop the caret inside the first heading (title) instead of at the doc start.
- Bug fix: YouTube embeds no longer hit error 153 in the VS Code webview — switched from `youtube-nocookie.com` to the standard `youtube.com/embed/` and added `referrerpolicy="no-referrer"` so the webview's `vscode-webview://` origin doesn't trip YouTube's stricter host checks.
- Bug fix: Added a visible "Open on YouTube" fallback link under every embedded video and marked it `data-external="true"` so a single click opens the video in the default browser (previously all in-editor anchors required Cmd/Ctrl+click). The GitHub card link now also opens externally on a single click.
- Bug fix: Broadened the CSP `frame-src` to cover `https://*.youtube.com` and `https://*.youtube-nocookie.com` so embed redirects to `m.youtube.com` or other subdomains aren't blocked.
- Change: YouTube embeds now render as a thumbnail card (like the GitHub card) instead of an iframe. The webview sandbox reliably breaks YouTube's inline player with error 153 on many videos; the card shows `img.youtube.com` thumbnail + URL and opens the video in the default browser on click. CSP `frame-src` reverted since no iframe is loaded.
- Feature: YouTube / GitHub embed cards show a focus-colored outline when the node is selected (arrow-key into the card or click it) so you can tell which embed is under the cursor.

## 2.1.0 — 2026-04-20

### YouTube & GitHub embeds

- Feature: Paste a YouTube URL (or run `/YouTube`) to embed a video player inline. Supports `youtube.com/watch`, `youtu.be`, and `/shorts/` URLs; videos render via `youtube-nocookie.com` so no cookies are set.
- Feature: Paste a GitHub URL (or run `/GitHub`) to render a static link card. Recognizes repos, PRs, issues, files (`/blob/...`), trees, and commits; each shows an appropriate icon, title (e.g. `#42`), and subtitle (e.g. `owner/repo · Pull request`). No network fetch — the card is parsed from the URL alone.
- Source stays plain: embeds serialize back as a bare URL on its own line, so the `.md` file is portable (GitHub, Obsidian, etc. see a normal link).

## 2.0.x — 2026-04-20

- Bug fix: Cursor position is preserved when the webview loses and regains focus (switching apps or VS Code tabs) — the caret returns to where you left off instead of being dropped.
- Bug fix: Undo (Cmd/Ctrl+Z) no longer jumps the cursor to the end of the file — the caret stays at the location of the undone change.
- Bug fix: Exiting an inline or block math node (Enter / Escape) places the cursor right after the math node instead of leaving it stranded.
- Feature: Arrow keys escape math editors — Left at the start of a math input exits to before the node, Right at the end exits to after.
- Feature: Up / Down also escape math editors — inline math exits before / after on any row; block math exits when the caret is on the first / last line of the textarea.

## 2.0.0 — 2026-04-13

### Open-source launch

- Overheads: Licensed under MIT (`LICENSE` + `package.json`).
- Overheads: Canonical repository moved to `https://github.com/chaudhary1337/markdown-studio` (the old `markdown-studio-issues` repo is retired).
- Overheads: Source documentation (`SPEC.md`, `TODO.md`, `CLAUDE.md`) brought in line with the current codebase.

## 1.0.x — 2026-04-08

- Feature: Full image support — insert dialog, drag-and-drop, paste, captions, custom Tiptap NodeView.
- Workaround: Graceful fallback when Claude Code proposes edits we can't intercept pre-acceptance.
- Bug fix: Currency `$` signs no longer get parsed as math delimiters; table padding normalized to eliminate first-roundtrip whitespace diffs.
- Overheads: Consolidated README images under `assets/` with relative paths (no more raw\.githubusercontent URLs); extension icon moved to `assets/logo7.png`
- Overheads: Updated repository URL to `markdown-studio-issues`
- Overheads: Updated README copy and branding to "Markdown Studio" from "Better Markdown"

## 1.0.0 — 2026-04-08

### Rich Editing

- WYSIWYG markdown editor with full GFM support
- Headings (h1-h6), bold, italic, code, links, images, blockquotes, horizontal rules
- Tables with floating toolbar to add/delete rows and columns
- Task lists with Notion-style custom checkboxes
- Ordered, unordered, and nested lists with correct round-trip formatting
- Code blocks with syntax highlighting and language selector
- Math support — inline (`$...$`) and block (`$$...$$`) with KaTeX rendering, slash commands, and click-to-edit LaTeX source
- Slash command menu — type `/` at the start of a line to insert blocks (headings, lists, tables, code blocks, math, images)
- Copy selection as markdown source (Cmd+C / Cmd+X)
- Configurable serialization settings (bullet style, emphasis markers, HR character, normalizations)

### Navigation

- Table of contents sidebar with filtering, drag-to-resize, and truncation
- Sticky headings — current section heading pins to the top while scrolling
- Find in document (Cmd+F / Ctrl+F) with regex and case-sensitive modes

### Diff

- Rich diff view — compare working copy against HEAD, inline or standalone panel
- Rendered mode with word-level green/red highlights and prev/next hunk navigation (j/k)
- Source mode with line-level diff
- Available from editor toolbar, SCM context menu, diff-editor toolbar, and command palette

### Round-trip Fidelity

- h4-h6 preserved via trailing HTML comment metadata
- Table cell code-span pipes handled without double-escaping
- Unicode-aware underscore unescaping
