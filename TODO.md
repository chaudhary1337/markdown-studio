# Better Markdown — TODO

## Done

- [x] Toggle between rich/source editor (Cmd+Shift+M)
- [x] Ctrl+F find-in-page with highlighting (CSS Custom Highlight API + mark fallback)
- [x] Preserve h4-h6 headings via metadata comment
- [x] Prefix all console logging with `[better-markdown]`
- [x] Fix list item formatting (orphaned markers, loose lists)
- [x] Syntax highlighting in code blocks (lowlight)
- [x] Ctrl+F for editor content; persistent filter on TOC
- [x] Line-wrap TOC entries, truncate at 128 chars
- [x] Migrate from BlockNote to Tiptap (blockquotes, HRs, h1-h6, task lists)
- [x] Slash command menu (/ at start of line)
- [x] Fix list nesting round-trip (wrap bare `<li>` text in `<p>` for Tiptap parser)
- [x] Fix table corruption with `|` inside code spans (protect pipes before remark parse)
- [x] Unescape `\_` in variable names, `\[` brackets, `\~` tildes
- [x] Task list checkbox round-trip (GFM ↔ Tiptap taskItem conversion)
- [x] Image separation (each image in its own `<p>` block)
- [x] Fix `\|` double-escape in code spans within table cells (use negative lookbehind)
- [x] Unescape `\_` around Unicode word chars (&#x3B2;_&#x6B;l, &#x65E5;_&#x672C;) — use `\p{L}` instead of `\w`
- [x] `compactLists` preserves blank lines around indented paragraphs (verified via test coverage)
- [x] Git diffs work — non-file URIs render read-only in Tiptap with a badge
- [x] Copy as markdown source — selection serialised to .md on Cmd+C / Cmd+X
- [x] Settings panel in webview — every normalization step + serializer marker configurable, persisted via globalState
- [x] Rich diff view — inline toggle (vs HEAD) + standalone panel via `betterMarkdown.openDiff`, wired into SCM context menu, diff-editor toolbar, and command palette
- [x] Diff view has Source (line, diff2html) and Rendered (word-level, node-htmldiff) modes with green/red/blue highlighting and native GFM checkbox rendering
- [x] Prev/Next hunk navigation in Rendered diff (↑/↓ buttons, j/k shortcuts)
- [x] Table row/column controls — floating toolbar (add/delete row/column) appears when cursor is inside a table
- [x] Fix task list checkbox alignment — use matching `1.6em` line-height units instead of hardcoded px offset
- [x] Non-file URIs (git:, scm:) fall back to VS Code's native text editor instead of rich editor
- [x] Extension diff defaults to rendered (rich) mode instead of source
- [x] Strip `<https://...>` autolinks back to bare URLs; unescape `\=` before non-`=` content
- [x] Ctrl+F → Esc places cursor at the active match; reopening Ctrl+F resumes with same query and position
- [x] Math support — inline (`$...$`) and block (`$$...$$`) via KaTeX rendering, slash commands `/Math Block` and `/Inline Math`, click-to-edit LaTeX source

## Remaining

- [x] Auto-close non-file custom editor tabs (git:, scm: schemes) via `onDidChangeTabs`
- [ ] Claude Code rich diff integration — blocked on Claude Code exposing proposed content before acceptance (see SPEC.md § Claude Code Integration)
- [ ] TOC should highlight diffed headings (added/removed/changed) when diff view is active
- [ ] Allow images to be dragged and dropped into the editor
- [ ] Add mermaid diagrams
- [ ] Add buttons as "editors" generally do, to let people click buttons etc. and insert checkboxes etc.
- [ ] Claude Code integration — live diff in the rich editor when Claude edits a .md file; show accept (tick) / reject (cross) icons inline so the user can review and apply suggestions directly without leaving the rich editor
- [ ] esc. key should highlight the entire line just like notion
- [ ] make sure cursor does not vanish/gets autofocused after naving inside/outside of katex

## Known Limitations

- Escaped markdown characters (`\*`, `\_`) lose backslash on round-trip (Tiptap stores rendered text, not source).
