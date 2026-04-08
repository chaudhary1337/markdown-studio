# Better Markdown

Notion-like WYSIWYG markdown editor for VS Code. Edit `.md` files with a rich editor that round-trips cleanly back to GFM source.

## Unique Features

### Rich git Diffs

We have had rich editing, but this is the first editor to have rich diffs.

![](diff.gif)

### Seamless Sync. Open in Default Editor, Open in Rich Editor, Open in Browser.

![seamless-sync](bait.gif)

### Search like you know.

pass

### Navigate without hassle.

![nagivate](navigate.gif)

## Cool Stuff

### Modes

#### Default Editor

Default editor supports opening in Rich Editor and Browser modes.

Enjoy it because this will be the last time you open the vanilla view.

![default-editor-overview](Screenshot%202026-04-08%20at%2011.56.29.png)

#### Rich Editor

Rich editor allows to go back to default editor mode directly. Also allows opening in the browser. All information is automatically and instantly synced.

![rich-editor-overview](<Screenshot 2026-04-08 at 12.03.00-1.png>)

#### Browser

Browser mode let's you go back to the VS Code window with one click.

Did I mention its very fast?

![browser-mode-overview](<Screenshot 2026-04-08 at 12.06.39.png>)

### Rich editing

- **WYSIWYG editor** — headings (h1-h6), bold, italic, code, links, images, blockquotes, horizontal rules
- **Tables** with floating toolbar to add/delete rows and columns
- **Task lists** with native checkboxes
- **Ordered, unordered, and nested lists** with correct round-trip formatting
- **Code blocks** with syntax highlighting
- **Math** — inline (`$E=mc^2$`) and block (`$$...$$`) with KaTeX rendering, click-to-edit LaTeX source
- **Slash command menu** — type `/` at the start of a line to insert headings, lists, tables, code blocks, math, images, and more
- **Copy as markdown** — Cmd+C / Cmd+X copies the selection as `.md` source

### Navigation

- **Table of contents** sidebar with filtering, drag-to-resize, and truncation at 128 chars
- **Sticky headings** — current section heading pins to the top while scrolling
- **Find in document** (Cmd+F / Ctrl+F) with regex and case-sensitive modes

### Diff

- **Rich diff view** — compare working copy against HEAD, inline or in a standalone panel
- **Rendered mode** (default) — word-level diffing with green/red highlights and prev/next hunk navigation (j/k shortcuts)
- **Source mode** — line-level diff, unified or side-by-side layout
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

## Installation

Hit the Install button on this page. No login, setup or permissions required. It works out of the box.

## Privacy

I do not collect telemetry, analytics, or usage data. I am too lazy to implement that.

Everything runs locally in your VS Code instance.

## Known "limitations"

"Its not a bug, its a feature."

- Conversion from markdown to rich text and back to markdown is not one-to-one exact map. The markdown after is normalized. You can control this via the settings icon in the rich editor mode.

<!-- better-markdown-meta {"h":[{"t":"Default Editor","l":4},{"t":"Rich Editor","l":4},{"t":"Browser","l":4}]} -->
