# Better Markdown — Claude workflow notes

## Before finishing ANY change to conversion logic

Always, in this order:

1. **Run tests**: `npm test`
   - Runs `scripts/test-conversions.ts` (95+ targeted cases: headings, lists,
     tables, code blocks, task lists, images, escaping, metadata,
     normalizeMarkdown unit tests, settings-driven behavior) and then
     `scripts/test-roundtrip.ts` (full-file round-trip on `test.md`).
   - Expect: all named tests pass, 0 known-failing.
2. **Build the extension**: `npm run build`
   - Esbuild must succeed for both `src/extension.ts` (node) and
     `webview/index.tsx` (browser). Type errors in either halt the build.

If you skip either step, ship breakage. Don't.

## Conversion pipeline files (where bugs live)

- `webview/hooks/useVSCodeSync.ts` — `markdownToHtml` / `htmlToMarkdown`,
  production DOM-based transforms (DOMParser-backed).
- `webview/markdown.config.ts` — `normalizeMarkdown` post-processing
  (task lists, table headers, unescaping, list compaction, etc.).
- `webview/metadata.ts` — h4-h6 preservation via trailing HTML comment.
- `scripts/pipeline.ts` — regex-based mirror of the production pipeline
  used by test scripts (no DOMParser in Node).

When you touch any of these, add/update a test case in
`scripts/test-conversions.ts` in the matching category (A-M).

## Adding a new conversion test

In `scripts/test-conversions.ts`:

- Full round-trip: `await roundtripCase(name, input, expectedOutput?)`
  (omit `expectedOutput` if round-trip is idempotent).
- Unit test on a helper: `eq(name, actual, expected)`.
- Boolean assertion: `assert(name, condition, detail?)`.
- Mark a documented-lossy case with `{ known: true }`; it shows as `○`
  and doesn't fail the suite.

## Table cell code-span pipes

`` `a|b` `` or `` `a\|b` `` inside a table cell round-trips to `` `a\|b` ``
(single backslash, correct GFM escape). Production and the test pipeline
agree — there are two coupled invariants keeping this clean:

1. `protectTableCodePipes` consumes `\|` as a single unit (strips the
   leading `\` alongside the `|`). Otherwise the backslash leaks into HTML
   and combines with remark-gfm's own escape to emit `\\|`.
2. We do NOT manually escape `|` inside `<td>/<th> <code>` before
   rehype-remark — remark-gfm handles table-cell pipe escaping natively.
   Adding our own escape there caused the `\\|` double-escape.

If you're touching either step, run category E tests and keep both
invariants aligned between `useVSCodeSync.ts` and `scripts/pipeline.ts`.
