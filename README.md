# Better Markdown

Notion-like WYSIWYG markdown editor for VS Code. Edit `.md` files with a rich editor that round-trips cleanly back to GFM source.

## Features

### Rich editing

- **WYSIWYG editor** powered by Tiptap — headings (h1-h6), bold, italic, code, links, images, blockquotes, horizontal rules
- **Tables** with floating toolbar to add/delete rows and columns
- **Task lists** with native checkboxes
- **Ordered, unordered, and nested lists** with correct round-trip formatting
- **Code blocks** with syntax highlighting (lowlight)
- **Slash command menu** — type `/` at the start of a line to insert headings, lists, tables, code blocks, images, and more
- **Copy as markdown** — Cmd+C / Cmd+X copies the selection as `.md` source

### Navigation

- **Table of contents** sidebar with filtering, drag-to-resize, and truncation at 128 chars
- **Sticky headings** — current section heading pins to the top while scrolling
- **Find in document** (Cmd+F / Ctrl+F) with regex and case-sensitive modes, powered by the CSS Custom Highlight API

### Diff

- **Rich diff view** — compare working copy against HEAD, inline or in a standalone panel
- **Rendered mode** (default) — word-level diffing with green/red highlights and prev/next hunk navigation (j/k shortcuts)
- **Source mode** — line-level diff via diff2html, unified or side-by-side layout
- Available from the editor toolbar, SCM context menu, diff-editor toolbar, and command palette
- VS Code's built-in git diff uses the native text editor for seamless source-level diffing

### Settings

- **Configurable serialization** — bullet style (`-` `*` `+`), emphasis markers, horizontal rule character, list indent style
- **Toggleable normalizations** — compact lists, unescape special chars, renumber ordered lists, fix table headers, dedup image alt text, code block language defaults
- All settings persisted via VS Code globalState and synced across open panels

### Keyboard shortcuts

| Shortcut    | Action                      |
| ----------- | --------------------------- |
| Cmd+Shift+M | Toggle rich / source editor |
| Cmd+F       | Find in document            |

## What makes it different

Better Markdown is the first VS Code WYSIWYG markdown editor to ship:

- **Integrated rich diff view** — no other WYSIWYG editor lets you diff rendered markdown against HEAD, with word-level highlights and hunk navigation, right inside the editor
- **Sticky headings** — the current section heading pins to the top as you scroll, so you always know where you are in a long document
- **Tested round-trip fidelity** — a 95+ case conversion test suite guarantees your markdown comes back clean; most editors silently reformat your source
- **Search across content and table of contents** — Cmd+F with regex and case-sensitive modes, plus TOC filtering to jump to any heading instantly
- **Custom serialization settings** — choose your bullet style, emphasis markers, horizontal rule character, and toggle normalizations like compact lists or ordered-list renumbering
- **Git SCM integration** — open a rich diff from the source-control context menu, the diff-editor toolbar, or the command palette

## Installation

Install from the `.vsix` file:

```
code --install-extension better-markdown-0.1.0.vsix
```

Or open VS Code, go to Extensions > `...` menu > "Install from VSIX..." and select the file.

## Known limitations

- Escaped markdown characters (`\*`, `\_`) lose the backslash on round-trip (Tiptap stores rendered text, not source)
- YAML frontmatter is not handled
- Brief flash on first load while Tiptap initializes
