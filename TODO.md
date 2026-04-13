# Better Markdown — TODO

## Done

- [x] Toggle between rich/source editor (Cmd+Shift+M)
- [x] Ctrl+F find-in-page with highlighting (CSS Custom Highlight API + mark fallback)
- [x] h4–h6 headings round-trip natively via Tiptap (earlier metadata-comment workaround removed in a75d719)
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
- [x] Don't parse currency `$` signs as math delimiters (1d51609)
- [x] Table formatting normalized to eliminate first-roundtrip whitespace diffs (6a9737e, b220192)
- [x] Auto-close non-file custom editor tabs (git:, scm: schemes) via `onDidChangeTabs`
- [x] Full image support — insert dialog, drag-and-drop, paste, captions, custom NodeView (e15f135)
- [x] CodeLens "Open in Rich Editor" / "Open in Browser" above line 1 in the native markdown editor
- [x] Refactor App.tsx into focused hooks (`useSettingsPanel`, `useEditorState`, `useClipboardHandlers`, `useDragDrop`) (64aa575)
- [x] Graceful fallback when Claude Code edits can't be intercepted pre-acceptance (04b2502)
- [x] Consolidate README assets under `assets/`, drop external `markdown-studio-issues` image hosting

## Remaining

- [ ] **[HIGH PRIORITY] Automate publishing to VS Code Marketplace + Open VSX on version tag.** Currently every release is a manual `npm run package` + `vsce publish` + `ovsx publish` from my laptop, which means Cursor / VSCodium / Gitpod / Theia users (Open VSX) lag behind or get skipped entirely. Target: push a `v*` tag → GitHub Actions builds, tests, and publishes to both registries.
  - **One-time human setup** (can't be automated): (1) generate an Azure DevOps PAT with scope `Marketplace → Manage` (all orgs) → GitHub repo secret `VSCE_PAT`; (2) generate an open-vsx.org access token → GitHub repo secret `OVSX_PAT`.
  - **Repo changes**: add `ovsx` to `devDependencies` (match `@vscode/vsce` version range); add `.github/workflows/publish.yml` triggered on `push: tags: 'v*'` that runs `npm ci` → `npm test` → `npm run build` → `npx vsce publish -p $VSCE_PAT` → `npx ovsx publish -p $OVSX_PAT` (both CLIs read the version from `package.json` — the tag just triggers); add `.github/workflows/ci.yml` running `npm test && npm run build` on every PR so auto-publish can't ship a broken main; append an `ovsx publish` line to `scripts/deploy.sh` under the `--publish` branch so manual local deploys also hit both registries.
  - **Release flow once wired**: bump `package.json` version + `CHANGELOG.md` → commit → `git tag v2.0.1 && git push --tags` → workflow runs, both marketplaces update within ~5 minutes.
- [ ] Claude Code rich diff integration — blocked on Claude Code exposing proposed content before acceptance (see SPEC.md § Claude Code Integration)
- [ ] TOC should highlight diffed headings (added/removed/changed) when diff view is active
- [ ] Add mermaid diagrams
- [ ] Add buttons as "editors" generally do, to let people click buttons etc. and insert checkboxes etc.
- [ ] Claude Code integration — live diff in the rich editor when Claude edits a .md file; show accept (tick) / reject (cross) icons inline so the user can review and apply suggestions directly without leaving the rich editor
- [ ] esc. key should highlight the entire line just like notion
- [ ] make sure cursor does not vanish/gets autofocused after naving inside/outside of katex
- [ ] Bullet points nested inside checkboxes do not appear right now. They are indented correctly.
- [ ] Diff view scrolls the navigator row and cuts it in half when scrolled down.
- [ ] Embeddings for YouTube & GitHub like Notion.
- [ ] Preserve inline sibling images side-by-side (e.g. README badge rows). Right now consecutive `![...]` on one line get split into separate paragraphs on round-trip, and raw `<p><img/>...</p>` HTML blocks are dropped entirely — so there's no way to keep a row of shields.io badges side-by-side through the rich editor. Fix in `webview/hooks/useVSCodeSync.ts` + `test/pipeline.ts`; add a test case in category I (images).
- [ ] This diff should not happen:

```diff
diff --git a/SPEC.md b/SPEC.md
index 16112b7..7c71357 100644
--- a/SPEC.md
+++ b/SPEC.md
@@ -205,10 +205,10 @@ better-markdown/
    - Image followed by duplicate alt-text line → dedup
    - Compact lists (remove blank lines between items)
    - Orphaned list marker merging
-6. Restore math from code/pre placeholders back to `$...$` / `$$...$$`
-7. `/` `&` HTML entity cleanup
-8. `prependFrontmatter()` restores YAML frontmatter at top of file
-9. Strip webview URI prefixes to restore relative image paths
+1. Restore math from code/pre placeholders back to `$...$` / `$$...$$`
+2. `/` `&` HTML entity cleanup
+3. `prependFrontmatter()` restores YAML frontmatter at top of file
+4. Strip webview URI prefixes to restore relative image paths
```

## Known Limitations

- Escaped markdown characters (`\*`, `\_`) lose backslash on round-trip (Tiptap stores rendered text, not source).
