# Better Markdown — TODO

- [x] Add a button to travel back and forth between the rich editor and the default text editor
- [x] Add Ctrl+F find-in-page with highlighting in the webview
- [x] Preserve h4-h6 headings (####, #####, ######) — currently downgraded to h3 (BlockNote only supports h1-h3)
- [x] Prefix all console logging with `[better-markdown]` for easier filtering in devtools
- [x] Fix linter breaking markdown list items — splits `- **Bold text**` into a bare `-` on one line and `**Bold text**` on the next with a blank line between, creating orphaned `-` markers that render as empty bullet points with content appearing as disconnected paragraphs. Also promotes nested sub-items (` - [link]`) to top-level list items, breaking parent-child relationships between citations and source URLs.
- [x] Fix syntax highlighting not working
- [x] Make both contents and table of contents independently searchable via the same search bar — support case-sensitive matching, regex, etc.
- [x] Line-wrap table of contents entries and truncate to 128 characters if longer
- [ ] Git diffs should work
- [ ] Make copy work (paste already works)
