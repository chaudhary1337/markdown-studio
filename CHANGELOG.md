# Changelog

## 2.1.x — 2026-04-20

- Change: Consolidated the two setup-related commands into one. `Markdown Studio: Open Setup Prompt` (which only re-showed an informational modal) and `Markdown Studio: Rerun First-Run Setup` (which only cleared a flag) were both narrow and overlapping. Replaced with `Markdown Studio: Factory Reset Settings` (`betterMarkdown.factoryReset`) — a single destructive command that wipes the `betterMarkdown.settings` and `betterMarkdown.consentShown` globalState entries, syncs `settingsUpdated` to every open webview so they re-merge with defaults, and shows a modal confirmation before applying. The on-open welcome modal still fires automatically the first time a markdown file is opened post-install (no command needed).
- Change: Settings-panel toggles now support an optional secondary `description` line rendered under the label in muted text. Used on the `autoSave` toggle: the label is now a short `Save normalization on open (Recommended)` and the rationale (round-trip stability, why dirty-on-open is the alternative) lives on its own line beneath. The `Toggle` component takes a new `description?: string` prop and the layout switched to `align-items: flex-start` with a vertical text stack.
- Bug fix: `Open in Browser` command now works from inside the rich editor. Cause: `vscode.window.activeTextEditor` returns `undefined` when the focused editor is a custom editor (the rich Markdown view), so the URI lookup fell through to the "no markdown file" warning even when a `.md` file was clearly open. Fall back to the active tab's input URI before consulting `activeTextEditor`, mirroring the resolution `Toggle Rich/Source Editor` already uses.
- Change: First-run setup prompt is now an in-editor modal (`SetupPrompt.tsx`) rendered inside the rich editor instead of a VS Code information notification, so it can't be missed in the bottom-right corner. The host posts `showSetupPrompt` to the webview after `ready` (so the listener is attached) and the webview posts `setupPromptChoice` back; `applySetupChoice` on the provider just records consent. Dismissing via Esc / click-outside / × is treated as `Keep defaults`. The modal offers two actions — `Review settings` (opens the ⚙ panel) and `Keep defaults` — the earlier `Disable all` button was removed because it conflated independent toggles and gave a misleading impression that the underlying md → html → md round-trip could be turned off; per-toggle control still lives in the ⚙ panel.
- Feature: First-run consent prompt for normalization. The very first time the rich editor opens a file after install, an in-editor modal asks the user how to handle on-open formatting changes — `Keep defaults` or `Review settings` (opens the ⚙ panel). The first-ever open also skips the silent save regardless of choice, so users aren't surprised by a disk write before they've decided. The prompt only fires once per install (recorded in globalState) and the ⚙ panel keeps full per-toggle control afterwards. The `Markdown Studio: Open Setup Prompt` command re-runs the dialog at any time.
- Change: User-facing labels in the command palette now read `Markdown Studio` (matches the marketplace `displayName`) instead of the legacy `Better Markdown`. Internal command IDs and the `betterMarkdown.editor` view type are unchanged so existing keybindings and editor associations keep working.
- Bug fix: bold-around-code abutting a word (e.g. `**\`bold code\`**Apples**`, no space) no longer saves with `**A**`-style numeric character entities cluttering the source. remark-stringify emits those references because CommonMark flanking rules disallow from closing directly into a word when the run contains a code span — without the entity, the bold disappears on re-open. The post-processor now swaps each`\&#xHH;`(or`\&#NN;`) safety escape adjacent to a `\*`/`\_` marker for the literal character preceded by an empty HTML comment (`\`), which is a valid CommonMark inline-HTML node that breaks the flanking run the same way without polluting the source. Round-trip is preserved on every pass.
- Bug fix: `**\`bold code\`\*\*`no longer loses its bold wrapper after a round-trip through the rich editor. Cause: Tiptap's default`Code`mark sets`excludes: '\_'`, which strips every other mark when code is applied — so `…`was parsed as plain`…`on the way in. Disabled StarterKit's bundled Code mark and re-added it with`excludes: ''\` so inline code can coexist with bold/italic. Closes #3.
- Overheads: README now shows animated demos of Mermaid diagrams and YouTube / GitHub embeds (`assets/mermaid.gif`, `assets/embedding.gif`).
- Feature: Mermaid diagram support. ` ```mermaid ` fences render as live diagrams inline; edit the source and the preview updates. Mermaid is lazy-loaded on first use so docs with no diagrams don't pay the around 1MB bundle cost. On parse errors, the source stays editable and the error is shown underneath. The source pane has a collapse toggle so you can hide the syntax and focus on the diagram. Diagrams scale to fill the preview width instead of rendering at mermaid's intrinsic (often tiny) pixel size. Closes #1.
- Bug fix: Ctrl+S no longer causes the doc to go dirty again after saving. Cause: users with `editor.formatOnSave: true` (a global default for many setups) run VS Code's built-in markdown formatter on save, which mutates the doc content. That mutation fired `onDidChangeTextDocument`, the provider pushed an `update` to the webview, Tiptap's `setContent` fired its own update event, `handleUpdate` re-serialized and sent a fresh `edit` back — creating a save-triggers-dirty loop. Passing `{ emitUpdate: false }` to `setContent` in the external-update branch breaks the loop; the host just told us the content, so there's nothing to echo back.
- Feature: Save the first-open normalization pass silently (default on). When a file is opened, the rich editor applies a md → html → md round-trip; that one pass is now written to disk so users don't see a surprise dirty state or lose the normalization by closing without saving. Every edit after that follows VS Code's own save behavior (`files.autoSave`, Cmd+S, dirty-prompt on close) — we don't debounce-save on your keystrokes. Toggle under Settings → Saving; non-file URIs (git:, vscode-scm:) are still never written. Closes #2.
- Bug fix: Rich editor tabs now stay in sync when hidden. Previously, external changes to a `.md` file (from Claude Code, git operations, format-on-save in the source view, or another editor panel) were dropped while the rich editor tab wasn't focused, so switching back showed a stale view. Combined with `retainContextWhenHidden: true`, the webview now keeps its DOM _and_ keeps applying document updates in the background.
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
