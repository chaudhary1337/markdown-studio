# Changelog

## 2.1.x — 2026-04-20

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
