# Better Markdown — TODO

- [x] Add a button to travel back and forth between the rich editor and the default text editor
- [x] Add Ctrl+F find-in-page with highlighting in the webview
- [x] Preserve h4-h6 headings (####, #####, ######) — currently downgraded to h3 (BlockNote only supports h1-h3)
- [x] Prefix all console logging with `[better-markdown]` for easier filtering in devtools
- [x] Fix linter breaking markdown list items
- [x] Fix syntax highlighting not working
- [x] Ctrl+F searches editor content; persistent filter on TOC
- [x] Line-wrap table of contents entries and truncate to 128 characters if longer
- [ ] Git diffs should work
- [ ] Make copy work (paste already works)
- [ ] Blockquotes (`> text`) — requires editor with blockquote block type (BlockNote doesn't have one)
- [ ] Horizontal rules (`---`) — requires editor with HR block type (BlockNote doesn't have one)
- [ ] Settings page (indentation size, etc.)
- [ ] Migrate from BlockNote to Tiptap for full CommonMark support (blockquotes, HRs, better nesting)
