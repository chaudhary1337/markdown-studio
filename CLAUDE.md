# Better Markdown — Claude workflow notes

## Before finishing ANY change to conversion logic

Always, in this order:

1. **Run tests**: `npm test`
   - Runs `scripts/test-conversions.ts` (70+ targeted cases: headings, lists,
     tables, code blocks, task lists, images, escaping, metadata,
     normalizeMarkdown unit tests) and then `scripts/test-roundtrip.ts`
     (full-file round-trip on `test.md`).
   - Expect: all named tests pass, 3 known-failing cases remain (documented
     in category M of test-conversions.ts).
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

## Known pipeline discrepancy (noted for future fixing)

`scripts/pipeline.ts` produces CLEANER output than production for table
cells containing code spans with `|`. Specifically:

- Test pipeline: `` `a|b` `` in a table cell round-trips to `` `a\|b` ``
  (single backslash — correct GFM escape).
- Production (`useVSCodeSync.ts`): round-trips to `` `a\\|b` `` (double
  backslash — leaks into source).

The production bug has two causes that must BOTH be fixed together:

1. `protectTableCodePipes` leaves a leading `\` when it sees `\|`, which
   surfaces as a literal backslash in HTML after placeholder restoration.
   Fix: consume the `\` alongside the `|` (see pipeline.ts for pattern).
2. `escapeCodePipesInTableCells` adds `\|` inside `<code>` before
   rehype-remark, but rehype-remark + remark-gfm already escape table-cell
   pipes natively. Fix: remove the manual escape.

TODO.md line claiming this is done is partially right (it stops
ESCALATION on re-saves) but the initial double-escape is still there.
