# Better Markdown — Claude workflow notes

## Before finishing ANY change

Run all four steps, in this order, every time. No exceptions.

1. **Run tests**: `npm test`
   - Runs `test/test-conversions.ts` (targeted cases: headings, lists, tables, code blocks, task lists, math, images, escaping, normalizeMarkdown unit tests, settings-driven behavior) and then `test/test-roundtrip.ts` (full-file round-trip on `test/test.md`).
   - Expect: all named tests pass, 0 known-failing.
1. **Build**: `npm run build`
   - Esbuild must succeed for both `src/extension.ts` (node) and `webview/index.tsx` (browser). Type errors in either halt the build.
1. **Package**: `npm run package`
   - Produces a `.vsix` file via `vsce package` for local install / distribution.
1. **Force install**: install the latest version of markdown studio. For example:`code --install-extension its-markdown-studio-2.1.7.vsix --force`. Refer Versioning section for more information on when the version changes.
   - Installs/updates the extension in VS Code. Reload the window afterwards.

If you skip any step, the user won't see the change. Always do all four.

## Versioning

Always bump the patch version by 0.1 (e.g. 1.0.1 → 1.0.2) unless the user explicitly states so, in which case bump minor (e.g. 1.0.x → 1.1.0). If you are confused about whether to bump by 0.0.1 or 0.1, ask the user.

Update the vsix filename in the force-install step above to match.

Always update `CHANGELOG.md` with every version bump. Patch-level changes within the same minor version are grouped under a single `x.y.x` heading (e.g. `## 1.0.x`).

## Conversion pipeline files (where bugs live)

- `webview/hooks/useVSCodeSync.ts` — `markdownToHtml` / `htmlToMarkdown`, production DOM-based transforms (DOMParser-backed).
- `webview/markdown.config.ts` — `normalizeMarkdown` post-processing (task lists, table headers, unescaping, list compaction, etc.).
- `test/pipeline.ts` — regex-based mirror of the production pipeline used by test scripts (no DOMParser in Node).

When you touch any of these, add/update a test case in `test/test-conversions.ts` in the matching category (A-P).

## Adding a new conversion test

In `test/test-conversions.ts`:

- Full round-trip: `await roundtripCase(name, input, expectedOutput?)` (omit `expectedOutput` if round-trip is idempotent).
- Unit test on a helper: `eq(name, actual, expected)`.
- Boolean assertion: `assert(name, condition, detail?)`.
- Mark a documented-lossy case with `{ known: true }`; it shows as `○` and doesn't fail the suite.

## Table cell code-span pipes

`` `a|b` `` or `` `a\|b` `` inside a table cell round-trips to `` `a\|b` `` (single backslash, correct GFM escape). Production and the test pipeline agree — there are two coupled invariants keeping this clean:

1. `protectTableCodePipes` consumes `\|` as a single unit (strips the leading `\` alongside the `|`). Otherwise the backslash leaks into HTML and combines with remark-gfm's own escape to emit `\\|`.
2. We do NOT manually escape `|` inside `<td>/<th> <code>` before rehype-remark — remark-gfm handles table-cell pipe escaping natively. Adding our own escape there caused the `\\|` double-escape.

If you're touching either step, run category E tests and keep both invariants aligned between `useVSCodeSync.ts` and `test/pipeline.ts`.

## Math round-trip pipeline

`$...$` (inline) and `$$...$$` (block) are parsed by `remark-math` and converted to `<span data-type="mathInline">` / `<div data-type="mathBlock">` via custom `remark-rehype` handlers (defined as `mathHandlers` in both `useVSCodeSync.ts` and `test/pipeline.ts`).

On the way back (HTML → markdown), `preprocessTiptapHtml` converts math nodes to code placeholders (`<code>BTRMK_MATH:latex</code>` for inline, `<pre><code class="language-btrmk-math-block">` for block). This protects LaTeX content from remark-stringify escaping. `postprocessMarkdown` restores them to `$...$` / `$$...$$`.

Keep the handlers and placeholder logic in sync between `useVSCodeSync.ts` (production, DOMParser) and `test/pipeline.ts` (tests, regex). Run category O tests when touching math.

## Embed round-trip pipeline (YouTube, GitHub)

A bare YouTube / GitHub URL on its own line becomes a rich embed in the editor. Remark-gfm parses the URL as an autolink (`<p><a href="url">url</a></p>`); the markdown-to-HTML step then rewrites that paragraph to `<p data-type="youtubeEmbed|githubEmbed" data-url="url">url</p>` which Tiptap parses as a `YouTubeEmbed` / `GitHubEmbed` node. On the way back, the node's renderHTML produces the same shape; rehype-remark drops `data-*` attrs and emits the URL as paragraph text, and `unescapeBareUrls` in `normalizeMarkdown` strips remark-stringify's `https\:` / `\.` safety escapes so the saved markdown is a plain URL (ready to be autolinked again on re-parse).

URL detection lives in `webview/extensions/YouTubeEmbed.tsx` (`isYouTubeUrl`, `getYouTubeVideoId`) and `webview/extensions/GitHubEmbed.tsx` (`isGitHubUrl`, `parseGitHubUrl`). The rewrite happens in `useVSCodeSync.ts` (DOMParser) and is mirrored in `test/pipeline.ts` (regex). Run category P tests when touching embeds.
