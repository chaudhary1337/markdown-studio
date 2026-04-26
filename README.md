# Markdown Studio

I read as much `.md` as all other programming languages combined.

Personal notes, research notes, Claude Code generated reports, random READMEs.

I find it easier to read Notion-like markdown rather than raw markdown.

That's why Markdown Studio exists.

## The Cool Stuff

### Rich git Diffs

You have seen rich editing. WYSIWYG for faster reading.

But have you seen rich diffing?

![diff](assets/diff.gif)

### Seamless Sync.

Open in the Default Editor.

Open in the Rich Editor.

Open in the Browser.

It just works.

![seamless-sync](assets/seamless-sync.gif)

### Navigate without hassle.

Sticky headings so you can navigate long documents with ease.

Table of contents so you know where you are.

Clicky here, go there.

![navigate](assets/navigate.gif)

## Loaded With Features

### Modes

#### Default Editor

Default editor supports opening in Rich Editor and Browser modes.

Enjoy it because this will be the last time you open the vanilla view.

![default-editor-overview](assets/default-editor-overview.png)

#### Rich Editor

Rich editor allows to go back to default editor mode directly. Also allows opening in the browser. All information is automatically and instantly synced.

![rich-editor-overview](assets/rich-editor-overview.png)

#### Browser

Browser mode lets you open the rich editor as a Chrome/Firefox tab, so you can take it with you everywhere your browser goes.

Drag and drop images, gifs, etc.

It's like Notion, but you own the data.

![browser-mode-overview](assets/browser-mode-overview.png)

### Rich editing

#### Slash Commands

The beloved `/` works out of the box. It's like you never left your favourite editor.

![slash-command-working](assets/slash-command-working.png)

#### Checkboxes, Tables, Math, Quotes, Code Blocks, and your standard stuff.

Tables have options to:

- add row above, add row below
- add column to the left, add columns to the right
- remove rows, remove columns
- drop the entire table

You can write math using $\KaTeX$ in both inline and block modes.

![checkboxes-table-inline-math](assets/checkboxes-table-inline-math.png)

![math-block](assets/math-block.png)

#### Mermaid Diagrams

` ```mermaid ` fences render as live diagrams inline — edit the source, the preview updates.

![mermaid](assets/mermaid.gif)

#### YouTube & GitHub Embeds

Paste a YouTube or GitHub URL and get a rich card; the source stays a bare URL so the file remains portable.

![embedding](assets/embedding.gif)

## Known Limitations

- Conversion from markdown to rich text and back to markdown is not one-to-one exact map. The markdown after is normalized. You can control this to some extent via the settings icon in the rich editor mode.
- Bold/italic adjacent to a word, when the run also contains a code span, can't be expressed in plain CommonMark (e.g. `**`bold`**Apples` parses as literal asterisks, not bold). The editor saves these as `**`bold`**<!---->Apples` — an empty HTML comment is the cleanest CommonMark-valid way to break the flanking run so the bold survives re-open. Adding a space (or any non-word char) avoids the separator entirely and is handled naturally.

---

## Meta Thingies

### Installation

Hit the Install button on the marketplace page. No login, setup or permissions required. It works out of the box.

### Commands

Every action is in the command palette under the `Markdown Studio:` prefix.

| Command palette title     | Shortcut                                      | What it does                                                                                                                                                      |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle Rich/Source Editor | Cmd/Ctrl+Shift+M (on `.md` files)             | Swap the active `.md` between the rich editor and VS Code's default text editor.                                                                                  |
| Find in Document          | Cmd/Ctrl+F (inside the rich editor)           | Open the in-editor search bar for the current rich-editor pane.                                                                                                   |
| Open Rich Diff            | Right-click an SCM entry, or the diff toolbar | Open a side-by-side or rendered markdown diff of the selected file vs HEAD (or any two URIs).                                                                     |
| Open in Browser           | —                                             | Spin up a local server and open the file in your default browser as the same rich editor — drag-and-drop images, leave it open as a tab, edits sync back to disk. |
| Factory Reset Settings    | —                                             | Wipe all Markdown Studio settings back to defaults and re-show the welcome modal on the next file open. Confirms before applying.                                 |

### Keyboard shortcuts

| Shortcut         | Action                                  |
| ---------------- | --------------------------------------- |
| Cmd/Ctrl+Shift+M | Toggle rich / source editor             |
| Cmd/Ctrl+F       | Find in document                        |
| /                | Open slash command menu (start of line) |
| Esc              | Close active modal (settings, setup)    |

### Privacy

I do not collect telemetry, analytics, or usage data.

I am too lazy to implement that.

Everything runs locally in your VS Code instance.

### Bugs/Feature Requests

If you encounter any bugs or have any feature requests, please [open an issue](https://github.com/chaudhary1337/markdown-studio/issues).

I am actively using it myself, so expect frequent updates.

### Available Platforms

VS Code: https://marketplace.visualstudio.com/items?itemName=tanishq-chaudhary.its-markdown-studio

Open VSIX: https://open-vsx.org/extension/tanishq-chaudhary/its-markdown-studio
