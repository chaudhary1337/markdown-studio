# Changelog

## 1.0.x — 2026-04-08

- Consolidated README images under `assets/` with relative paths (no more raw.githubusercontent URLs); extension icon moved to `assets/logo7.png`
- Updated repository URL to `markdown-studio-issues`
- Updated README copy and branding to Markdown Studio

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
