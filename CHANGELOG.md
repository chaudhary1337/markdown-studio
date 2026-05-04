# Changelog

## 2.3.x — 2026-05-02

- Bug fix: Bubble menu no longer re-renders on every ProseMirror transaction, fixing a per-keystroke perf regression introduced in 2.3.4. The menu's effect listened to `transaction` and unconditionally called `forceUpdate`, so the 488-line component reconciled on every keystroke even when no button state changed. Now the listener computes a small signature (selection range + every `isActive(...)` value the menu reads — bold/italic/strike/code/link, paragraph/blockquote/lists/codeblock, and headings 1–6) and only re-renders when the signature flips. Visibility is unchanged: showing/hiding is owned by Tiptap's `BubbleMenu` via `shouldShow`, which is unaffected. Net result: noticeably snappier typing on long documents.
- Feature: Inline math now triggers from typing `$...$` in the editor. Closing the second `$` (with non-space at both ends, e.g. `$E=mc^2$`) collapses the run into an inline math node — no more reaching for the slash menu. Currency phrasings like `$5 to $10` are left alone (a non-space-at-both-ends guard) and `$$...$$` block math doesn't get half-consumed (negative lookbehind on the opening `$`). Implemented as a Tiptap `InputRule` on the `MathInline` extension.
- Feature: Settings now live in VS Code's native config under the `markdownStudio.*` namespace and appear in the Settings UI (search "Markdown Studio"). All 16 settings can be edited there, synced via Settings Sync, or overridden per-workspace via `.vscode/settings.json`. The in-app ⚙ panel still works and writes to User scope. A one-time migration on first activation copies pre-existing globalState settings into User-scope config so nobody loses their configuration; the legacy `betterMarkdown.settings` globalState entry is cleared after the copy. The namespace is `markdownStudio.*` (not `betterMarkdown.*`) because VS Code's Settings UI auto-derives section labels by title-casing dotted segments — `betterMarkdown.bullet` would have rendered as "Better Markdown: Bullet" regardless of `configuration.title`. Internal command IDs and the `betterMarkdown.editor` view type are unchanged. Closes #4.
- Refactor: Extracted the bubble menu's URL editor into its own component (`webview/components/BubbleLinkEditor.tsx`). State, callbacks, and JSX that previously lived inline inside `EditorBubbleMenu.tsx` now belong to the focused child; the parent only keeps a `linkMode` boolean and an `onClose` handler. No behavior change.
- Feature: Restored the Link button in the bubble menu — this time as an inline URL editor instead of a `window.prompt`. Click the Link button (or press it via keyboard nav) and the bubble's button row swaps for a URL input flanked by Cancel / Apply / Remove. The input is auto-focused and pre-selected, so paste-and-Enter applies the link in one motion. Pressing Escape returns to the formatting row without applying. If the selection already has a link, the existing href is prefilled and the Remove button appears. Restored `BTN_LINK` (index 4) and bumped `BTN_TURN_INTO`/`BTN_COUNT` back to 5/6 so keyboard arrow-counting matches.
- Bug fix: Bubble menu no longer jumps a few pixels every time you click Bold / Italic / Strike. Toggling a mark reflows glyph metrics, so `view.coordsAtPos(to)` returned a slightly different x for the same selection range on each call, and the menu re-anchored on every transaction. Now the anchor is cached by `(from, to)` and stored relative to the editor DOM — bold/italic clicks reuse the cached offset (menu stays put) while scroll and resize still update because we re-read the editor's bounding rect on every read.
- Change: Bubble menu now opens below the end of the selection (anchored to a zero-size virtual rect at the trailing caret position with `placement: "bottom-start"`) instead of floating above the highlight. The menu used to sit on top of the selected text and obscure it; now the highlighted run stays fully visible while you click formatting buttons.

## 2.3.0 — 2026-05-02

Bubble menu contributed by [@gvajda](https://github.com/gvajda) — PR [#6](https://github.com/chaudhary1337/markdown-studio/pull/6). Thanks Gergely!

- Feature: Selection bubble menu. Highlight text and a floating toolbar pops up with Bold / Italic / Strike / Inline code buttons plus a "Turn into" dropdown (Text, H1-H6, Quote, Bullet / Numbered / Task list, Code block). Active marks/blocks are highlighted so you can tell what formatting is already applied and click to remove it — no need to delete and retype. Hidden inside code blocks, math, and embeds.
- Feature: Keyboard shortcut to open the bubble menu. Default `Mod+/` (⌘+/ on macOS, Ctrl+/ elsewhere) — if the cursor sits inside a word with no selection, the shortcut expands the selection to that word so the menu has something to anchor to. Customize or disable under Settings → Shortcuts.
- Feature: Keyboard navigation inside the bubble menu. After the open-menu shortcut fires, Arrow Left / Right moves between buttons, Arrow Down on "Turn into" opens the dropdown, Arrow Up / Down navigates dropdown items, Enter activates the focused button/item, Escape returns focus to the editor. The currently focused button gets a focus-colored outline.

## 2.2.x — 2026-05-02

- Change: Changed task lines in the rendered diff now stack on separate rows — old version on top, new version underneath — instead of sitting side-by-side on the same line. Done with a CSS rule that flips the `<del>`/`<ins>` wrappers inside a task list item to `display: block`.
- Bug fix: Checkbox diffs in the rendered diff view now show the whole task line on both sides — `[ ] foo` → `[x] foo` — instead of just the checkbox input wrapped in `<del>`/`<ins>` with the trailing label sitting unchanged. The pre-process pass now collapses the entire `<li.task-list-item>` body into a single `<video>` sentinel, with the original HTML stashed (encoded) on a `data-btrmk-html` attribute so post-processing can put it back verbatim. The visible inner text of the sentinel is "☐ " / "☑ ", which makes htmldiff treat the line as one atomic unit — any change (checkbox state, label text, or both) gets the full red-strike / green-underline pair.
- Bug fix: Block math diffs (`$$...$$`) now show the red/green background on the whole formula. The diff post-processor unwraps the sentinel into a block-level `<div data-type="mathBlock">`; with the wrapping `<del>`/`<ins>` defaulting to inline layout, the colored background only painted a thin baseline strip and the formula itself looked uncolored. Added a `:has()` rule that upgrades `<del>`/`<ins>` to `display: block` when their child is a block math, so the background fills the row. Inline math was unaffected and continues to work.
- Note: Skipped 2.1.30 → 2.2.1 because a stale `2.2.0` build is sitting in the local extensions cache and shadows everything below it (VS Code always loads the highest installed version). Bumping the minor digit forces the new build to take precedence; recommend `code --uninstall-extension tanishq-chaudhary.its-markdown-studio@2.2.0` once to clear it out.

## 2.1.x — 2026-04-20

- Bug fix: Math and GFM checkboxes in the rich diff view now show before/after with the standard red strike + green underline, instead of just the new version. Cause: htmldiff's token-key function only captures attributes for `<img src>`, `<a href>`, `<object data>`, `<iframe src>`, and the trio `<svg>/<math>/<video>` (compared as the full token); every other tag collapses to just `<tagname>`, so `<span data-latex="a^2">` vs `<span data-latex="b^2">`, and `<input type="checkbox">` vs `<input type="checkbox" checked>`, both look identical to it. We now wrap each math node and each checkbox in a `<video>` sentinel before handing the HTML to htmldiff (chose `<video>` over the more obvious `<math>`/`<svg>` because it's the only one of the three that DOMParser parses as a regular HTML element — no foreign-content namespace switch). htmldiff sees changed sentinels as different tokens and emits a `<del>`/`<ins>` pair around the wrapper; a post-processing pass replaces each sentinel with the actual rendered KaTeX `<span>`/`<div>` or the actual `<input type="checkbox">`. Side effect: the older `math-diff-changed` blue tint added in 2.1.28 is gone — the standard ins/del coloring now applies to math just like the rest of the document.
- Bug fix: Rich diff view now KaTeX-renders math (`$...$` and `$$...$$`) instead of showing the raw LaTeX source. The markdown-to-HTML pipeline used by the diff (`markdownToDisplayHtml`) emits `<span data-type="mathInline" data-latex="...">` / `<div data-type="mathBlock" ...>` placeholders meant to be picked up by Tiptap's NodeView, but the diff view stuffs the HTML straight into the DOM with `dangerouslySetInnerHTML` and never ran KaTeX. KaTeX rendering now happens inside the post-processing pass that unwraps the `<video>` sentinels (see above).
- Bug fix: Diff view no longer shows a duplicated, undiffed copy of the document trailing the diff. Cause: `.diff-view` was `position: absolute; inset: 0` inside `.editor-container` (which is `overflow-y: auto`), so it only covered the visible viewport. As soon as the user scrolled past the diff's height, the underlying Tiptap editor — still mounted as a sibling of the DiffView — became visible, looking like the entire document had been re-pasted at the bottom without diff marks. Switched the overlay to `position: fixed; inset: 0` so it pins to the webview viewport regardless of editor-container scroll state.
- Bug fix: Diff toolbar no longer slides up by half its height the first time Prev/Next is pressed. Cause: `el.scrollIntoView({ block: "center" })` walks the entire ancestor chain and scrolls every overflow:auto container that needs to scroll — including `.editor-container` outside the diff — which dragged the toolbar partway off-screen. Replaced with a manual `body.scrollTo({ top })` computed from `getBoundingClientRect`, scoped to `.diff-body` only. Added `flex-shrink: 0` to `.diff-toolbar` defensively so it can never compress under flex pressure.
- Bug fix: GFM checkboxes inside the rendered diff now show the Notion-style custom box even when `htmldiff` has wrapped the `<input>` in `<ins>`/`<del>`. The CSS used a direct-child combinator (`li.task-list-item > input`) which broke as soon as a parent `<ins>` was introduced; switched to a descendant selector.
- Bug fix: Inline math whose content starts with a digit (e.g. `$24 \times 5 = 120$`) now renders as math instead of literal text. Cause: `protectCurrencyDollars` matched any `$<digit>` and replaced the leading `$` with a placeholder so unrelated currency amounts (`$14B … $1.4B`) wouldn't be paired by `remark-math`. That same rule consumed the opener of valid inline math, leaving the closing `$` orphaned and the whole span emitted as plain text. Replaced the blind regex with a per-line scan that, for each `$<digit>`, looks ahead for a closing `$` and only protects when the content between them doesn't look like math (no `\command`, no sub/superscript, no equation-form `=`, no operator-with-letter pattern, and no markdown bold markers).
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
