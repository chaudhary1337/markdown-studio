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
- [x] Unescape `\_` around Unicode word chars (β\_kl, 日\_本) — use `\p{L}` instead of `\w`

## Remaining

- [ ] Git diffs should work
- [ ] Make copy work (paste already works)
- [ ] Settings page (indentation size, emphasis style, etc.)
- [ ] `compactLists` removes blank lines between bullet list and following paragraph that's indented under a list item — cosmetic but changes structure

## Known Limitations

- Escaped markdown characters (`\*`, `\_`) lose backslash on round-trip (Tiptap stores rendered text, not source)
- Empty code blocks (``` with no language) stay as-is
- YAML frontmatter not handled
- First load has brief flash while Tiptap initializes
