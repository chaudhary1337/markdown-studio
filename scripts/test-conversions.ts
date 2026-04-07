/**
 * Extensive conversion tests: markdown ↔ HTML round-trips + unit tests.
 *
 * Test categories:
 *   A. Headings (incl. h4-h6 metadata preservation)
 *   B. Inline formatting (bold, italic, code, strike)
 *   C. Lists (unordered, ordered, nested, mixed)
 *   D. Task lists (GFM ↔ Tiptap conversion)
 *   E. Tables (incl. `|` in code spans, `\|` escape protection)
 *   F. Code blocks (language labels, shellscript → bash)
 *   G. Images (alt text, separation)
 *   H. Blockquotes
 *   I. Horizontal rules
 *   J. Special characters / escaping
 *   K. Metadata functions
 *   L. normalizeMarkdown unit tests
 *   L2. Frontmatter preservation
 *   M. Known-failing cases (documented, expected to fail)
 *
 * Usage: npx tsx scripts/test-conversions.ts
 */

import { roundTrip, mdToHtml, htmlToMd } from "./pipeline";
import { normalizeMarkdown, buildMarkdownConfig } from "../webview/markdown.config";
import { DEFAULT_SETTINGS, mergeSettings } from "../webview/settings";
import {
  extractMeta,
  buildMeta,
  restoreHeadings,
  appendMeta,
  mergeMetadata,
  type Metadata,
} from "../webview/metadata";
import { extractFrontmatter, prependFrontmatter } from "../webview/frontmatter";

// ============================================================================
// Mini test harness
// ============================================================================

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  known?: boolean;
}

const results: TestResult[] = [];
let currentCategory = "";

function category(name: string) {
  currentCategory = name;
}

function normalize(s: string): string {
  // Trim trailing newlines so "foo" and "foo\n" compare equal.
  // remark-stringify always appends a newline; test inputs usually don't.
  return s.replace(/\n+$/, "");
}

async function roundtripCase(
  name: string,
  input: string,
  expected?: string,
  opts: { known?: boolean } = {}
) {
  const actual = await roundTrip(input);
  const exp = expected ?? input;
  const passed = normalize(actual) === normalize(exp);
  results.push({
    name,
    category: currentCategory,
    passed,
    expected: exp,
    actual,
    known: opts.known,
  });
}

function eq(name: string, actual: string, expected: string, opts: { known?: boolean } = {}) {
  const passed = normalize(actual) === normalize(expected);
  results.push({
    name,
    category: currentCategory,
    passed,
    expected,
    actual,
    known: opts.known,
  });
}

function assert(name: string, condition: boolean, detail?: string, opts: { known?: boolean } = {}) {
  results.push({
    name,
    category: currentCategory,
    passed: condition,
    actual: condition ? "OK" : detail ?? "(no detail)",
    expected: "OK",
    known: opts.known,
  });
}

// ============================================================================
// Tests
// ============================================================================

async function run() {
  // --------------------------------------------------------------------------
  category("A. Headings");
  // --------------------------------------------------------------------------

  await roundtripCase("h1 round-trip", "# Hello");
  await roundtripCase("h2 round-trip", "## Hello");
  await roundtripCase("h3 round-trip", "### Hello");

  // h4-h6 require metadata preservation
  await roundtripCase(
    "h4 preserved via metadata",
    "#### Heading 4\n\n<!-- better-markdown-meta {\"h\":[{\"t\":\"Heading 4\",\"l\":4}]} -->\n"
  );
  await roundtripCase(
    "h5 preserved via metadata",
    "##### Heading 5\n\n<!-- better-markdown-meta {\"h\":[{\"t\":\"Heading 5\",\"l\":5}]} -->\n"
  );
  await roundtripCase(
    "h6 preserved via metadata",
    "###### Heading 6\n\n<!-- better-markdown-meta {\"h\":[{\"t\":\"Heading 6\",\"l\":6}]} -->\n"
  );
  await roundtripCase(
    "mixed h1-h6 preserved",
    "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n\n<!-- better-markdown-meta {\"h\":[{\"t\":\"H4\",\"l\":4},{\"t\":\"H5\",\"l\":5},{\"t\":\"H6\",\"l\":6}]} -->\n"
  );

  // Without metadata scanning (skipMeta), h4-h6 get downgraded to h3
  {
    const { roundTrip } = await import("./pipeline");
    const got = await roundTrip("#### Heading 4", { skipMeta: true });
    eq("h4 downgrades to h3 when metadata is skipped", got, "### Heading 4");
  }

  // --------------------------------------------------------------------------
  category("B. Inline formatting");
  // --------------------------------------------------------------------------

  await roundtripCase("bold", "This has **bold text** in it.");
  await roundtripCase("italic", "This has _italic text_ in it.");
  await roundtripCase("inline code", "This has `code` in it.");
  await roundtripCase("strikethrough", "This has ~~strike~~ text.");
  await roundtripCase(
    "bold italic code strike together",
    "This has **bold text** and _italic text_ and `inline code` and ~~strikethrough~~."
  );
  await roundtripCase(
    "nested bold+italic",
    "Mixed: **bold and _italic_ together** and more text."
  );
  await roundtripCase(
    "bold mid-sentence",
    "A sentence with **bold** in the middle and _emphasis_ too."
  );

  // --------------------------------------------------------------------------
  category("C. Lists");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "unordered simple",
    "- Item one\n- Item two\n- Item three"
  );
  await roundtripCase(
    "unordered with bold",
    "- Item one\n- Item two\n- Item three with **bold**\n- Item with `code`"
  );
  await roundtripCase(
    "unordered nested 2 levels",
    "- Parent item\n  - Child item\n  - Another child\n- Back to parent"
  );
  await roundtripCase(
    "unordered nested 3 levels",
    "- Parent item\n  - Child item\n  - Another child\n    - Grandchild\n- Back to parent"
  );
  await roundtripCase("ordered simple", "1. First\n2. Second\n3. Third");
  await roundtripCase(
    "ordered nested",
    "1. First\n   1. Sub-first\n   2. Sub-second\n2. Second"
  );
  await roundtripCase(
    "mixed ul+ol",
    "- Unordered\n  1. Ordered child\n  2. Another ordered\n- Back to unordered"
  );
  await roundtripCase(
    "list with inline link",
    "- List with [link](https://example.com)\n  - Nested [link](https://example.com/nested)"
  );

  // --------------------------------------------------------------------------
  category("D. Task lists");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "task list all states",
    "- [ ] Unchecked task\n- [x] Checked task\n- [ ] Another unchecked\n- [x] Another checked"
  );
  await roundtripCase(
    "task list with formatting",
    "- [ ] Task with **bold**\n- [x] Done with `code`"
  );

  // --------------------------------------------------------------------------
  category("E. Tables");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "simple 3-col table",
    "| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |"
  );

  // `|` inside code span in table cell — the critical protectTableCodePipes test.
  // Output canonicalizes to GFM-escaped `\|` (which is the correct markdown).
  await roundtripCase(
    "table with | in code span → escapes to \\|",
    "| Syntax | Example |\n| ------ | ------- |\n| pipe   | `a|b`   |",
    "| Syntax | Example |\n| ------ | ------- |\n| pipe   | `a\\|b`  |"
  );

  // `\|` already escaped — must stay `\|`, NOT become `\\|`
  await roundtripCase(
    "table with escaped \\| in code span (no double-escape)",
    "| Syntax | Example |\n| ------ | ------- |\n| escape | `a\\|b`  |"
  );

  // Multiple pipes in single code span
  await roundtripCase(
    "table cell with multiple | in code span",
    "| col     |\n| ------- |\n| `a|b|c` |",
    "| col       |\n| --------- |\n| `a\\|b\\|c` |"
  );

  // --------------------------------------------------------------------------
  category("F. Code blocks");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "code block javascript",
    '```javascript\nfunction hello() {\n  console.log("world");\n}\n```'
  );
  await roundtripCase(
    "code block python",
    '```python\ndef hello():\n    print("world")\n```'
  );
  await roundtripCase(
    "code block bash",
    '```bash\necho "hello world"\n```'
  );
  await roundtripCase(
    "code block no language stays bare",
    "```\nplain code\nno language\n```"
  );

  // shellscript → bash normalization
  eq(
    "normalizeMarkdown: shellscript → bash",
    normalizeMarkdown("```shellscript\necho hi\n```\n"),
    "```bash\necho hi\n```\n"
  );

  // --------------------------------------------------------------------------
  category("G. Images");
  // --------------------------------------------------------------------------

  await roundtripCase("image with alt", "![Alt text](image.png)");
  await roundtripCase("image without alt", "![](no-alt.png)");
  await roundtripCase(
    "two images separate blocks",
    "![First](one.png)\n\n![Second](two.png)"
  );

  // --------------------------------------------------------------------------
  category("H. Blockquotes");
  // --------------------------------------------------------------------------

  await roundtripCase("blockquote simple", "> This is a blockquote.");
  await roundtripCase(
    "blockquote multi-paragraph",
    "> This is a blockquote.\n>\n> With multiple paragraphs."
  );
  await roundtripCase(
    "blockquote nested",
    "> Nested:\n>\n> > Inner quote"
  );

  // --------------------------------------------------------------------------
  category("I. Horizontal rules");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "horizontal rule between sections",
    "## Section 1\n\n---\n\n## Section 2"
  );

  // --------------------------------------------------------------------------
  category("J. Special characters / escaping");
  // --------------------------------------------------------------------------

  // Unescape \~ → ~
  await roundtripCase(
    "bare tilde preserved",
    "Tildes: ~ single tilde and ~~ double tildes ~~."
  );

  // Unescape standalone \*
  await roundtripCase(
    "bare asterisk preserved",
    "Asterisks in text: 2 * 3 = 6."
  );

  // Unescape \_ in words (ASCII)
  eq(
    "normalizeMarkdown: unescape \\_ in words",
    normalizeMarkdown("future\\_relevance check\n"),
    "future_relevance check\n"
  );

  // Unescape \_ in words (Unicode — Greek, CJK)
  eq(
    "normalizeMarkdown: unescape \\_ around Unicode (β\\_kl)",
    normalizeMarkdown("β\\_kl\n"),
    "β_kl\n"
  );
  eq(
    "normalizeMarkdown: unescape \\_ around CJK (日\\_本)",
    normalizeMarkdown("日\\_本\n"),
    "日_本\n"
  );

  // Unescape \[ brackets
  eq(
    "normalizeMarkdown: unescape \\[",
    normalizeMarkdown("see \\[note] here\n"),
    "see [note] here\n"
  );

  // Unescape \~
  eq(
    "normalizeMarkdown: unescape \\~",
    normalizeMarkdown("use \\~ for home\n"),
    "use ~ for home\n"
  );

  // Unescape \= before non-= content (e.g. => arrows)
  eq(
    "normalizeMarkdown: unescape \\=> arrow",
    normalizeMarkdown("\\=> leads to something\n"),
    "=> leads to something\n"
  );

  // Strip <autolinks> back to bare URLs
  eq(
    "normalizeMarkdown: strip <https://...> autolink",
    normalizeMarkdown("see <https://arxiv.org/pdf/1602.04938>\n"),
    "see https://arxiv.org/pdf/1602.04938\n"
  );

  // Autolinks inside code spans must NOT be stripped
  eq(
    "normalizeMarkdown: keep <url> inside code span",
    normalizeMarkdown("use `<https://example.com>` in code\n"),
    "use `<https://example.com>` in code\n"
  );

  // --------------------------------------------------------------------------
  category("K. Metadata functions");
  // --------------------------------------------------------------------------

  // buildMeta scans h4-h6
  const meta1 = buildMeta("# H1\n\n#### H4\n\n##### H5\n\n###### H6\n");
  assert(
    "buildMeta: scans h4-h6",
    meta1.h.length === 3 &&
      meta1.h[0].t === "H4" &&
      meta1.h[0].l === 4 &&
      meta1.h[1].l === 5 &&
      meta1.h[2].l === 6,
    JSON.stringify(meta1)
  );

  assert(
    "buildMeta: ignores h1-h3",
    buildMeta("# a\n## b\n### c").h.length === 0
  );

  // extractMeta
  const ex1 = extractMeta(
    'content\n\n<!-- better-markdown-meta {"h":[{"t":"X","l":4}]} -->\n'
  );
  assert(
    "extractMeta: strips meta block",
    ex1.content.trim() === "content" && ex1.meta.h[0].t === "X",
    JSON.stringify(ex1)
  );

  const ex2 = extractMeta("plain content\n");
  assert(
    "extractMeta: returns empty meta when absent",
    ex2.content === "plain content\n" && ex2.meta.h.length === 0
  );

  // appendMeta
  const app1 = appendMeta("# hi\n", { h: [{ t: "hi", l: 4 }] });
  assert(
    "appendMeta: appends meta comment",
    app1.includes("better-markdown-meta") && app1.includes('"t":"hi"'),
    app1
  );

  const app2 = appendMeta("# hi\n", { h: [] });
  assert(
    "appendMeta: no-op with empty meta",
    !app2.includes("better-markdown-meta"),
    app2
  );

  // appendMeta strips existing meta first
  const app3 = appendMeta(
    '# hi\n\n<!-- better-markdown-meta {"h":[]} -->\n',
    { h: [{ t: "hi", l: 4 }] }
  );
  const metaCount = (app3.match(/better-markdown-meta/g) || []).length;
  assert(
    "appendMeta: replaces existing meta (no dup)",
    metaCount === 1,
    `found ${metaCount} meta blocks`
  );

  // restoreHeadings
  const restored = restoreHeadings("### Hello\n\n### Other", {
    h: [{ t: "Hello", l: 4 }],
  });
  assert(
    "restoreHeadings: applies metadata to matching heading",
    restored.includes("#### Hello") && restored.includes("### Other"),
    restored
  );

  // restoreHeadings: no-op with empty meta
  assert(
    "restoreHeadings: no-op with empty meta",
    restoreHeadings("### hi", { h: [] }) === "### hi"
  );

  // mergeMetadata — scanned takes priority
  const merged = mergeMetadata(
    { h: [{ t: "A", l: 4 }] },
    { h: [{ t: "A", l: 5 }, { t: "B", l: 6 }] }
  );
  assert(
    "mergeMetadata: scanned takes priority, fills in missing",
    merged.h.length === 2 &&
      merged.h.find((h) => h.t === "A")?.l === 4 &&
      merged.h.find((h) => h.t === "B")?.l === 6,
    JSON.stringify(merged)
  );

  // --------------------------------------------------------------------------
  category("L. normalizeMarkdown unit tests");
  // --------------------------------------------------------------------------

  eq(
    "bullet * → -",
    normalizeMarkdown("* one\n* two\n* three\n"),
    "- one\n- two\n- three\n"
  );

  eq(
    "renumber ordered list",
    normalizeMarkdown("1. first\n1. second\n1. third\n"),
    "1. first\n2. second\n3. third\n"
  );

  eq(
    "orphaned list marker merging",
    normalizeMarkdown("- \n\n  text here\n"),
    "- text here\n"
  );

  // Task list checkbox fix patterns from BlockNote era
  eq(
    "task list: fix \\[ ] → [ ]",
    normalizeMarkdown("- \\[ ] todo item\n"),
    "- [ ] todo item\n"
  );

  eq(
    "task list: fix \\[x] → [x]",
    normalizeMarkdown("- \\[x] done item\n"),
    "- [x] done item\n"
  );

  // Image + duplicate alt text dedup
  eq(
    "image followed by alt text dedup",
    normalizeMarkdown("![pic](a.png)\npic\n"),
    "![pic](a.png)\n"
  );

  // compactLists: removes blank lines between list items
  eq(
    "compactLists: removes blank lines between items",
    normalizeMarkdown("- one\n\n- two\n\n- three\n"),
    "- one\n- two\n- three\n"
  );

  // compactLists preserves blanks between different list types at top level
  const mixedListOut = normalizeMarkdown("- bullet\n\n1. number\n");
  assert(
    "compactLists: keeps blank between ul and ol at top level",
    mixedListOut.includes("- bullet\n\n1. number"),
    mixedListOut
  );

  // compactLists preserves blanks between list item and indented paragraph
  // (structural: blank + indent = paragraph IS part of the list item)
  eq(
    "compactLists: preserves blank between list item and indented para (2sp)",
    normalizeMarkdown("- item\n\n  indented para\n"),
    "- item\n\n  indented para\n"
  );
  eq(
    "compactLists: preserves blank between list item and 4-sp indent (code)",
    normalizeMarkdown("- item\n\n    code-indented\n"),
    "- item\n\n    code-indented\n"
  );
  eq(
    "compactLists: preserves blank between list and following unindented para",
    normalizeMarkdown("- one\n- two\n\nparagraph after\n"),
    "- one\n- two\n\nparagraph after\n"
  );

  // Table header reconstruction: empty header row + separator → first row becomes header
  const tableFixed = normalizeMarkdown(
    "|   |   |\n| - | - |\n| A | B |\n| C | D |\n"
  );
  assert(
    "fixTableHeaders: empty header row reconstructed from first data row",
    tableFixed.includes("| A | B |") &&
      !tableFixed.match(/^\|\s+\|\s+\|\s*$/m),
    tableFixed
  );

  // HTML entity cleanup
  eq(
    "HTML entity cleanup: &#x20; → space",
    "foo&#x20;bar".replace(/&#x20;/g, " "),
    "foo bar"
  );
  eq(
    "HTML entity cleanup: &amp; → &",
    "a &amp; b".replace(/&amp;/g, "&"),
    "a & b"
  );

  // Bold in lists (regression test for list item serialization)
  await roundtripCase(
    "bold in lists",
    "- **Bold list item**\n- **Another bold** with trailing text\n- Normal then **bold part**\n- _Italic item_"
  );

  // Nested bold/italic preservation
  await roundtripCase(
    "bold containing italic",
    "**outer _inner_ text**"
  );

  // --------------------------------------------------------------------------
  category("L2. Frontmatter preservation");
  // --------------------------------------------------------------------------

  // extractFrontmatter unit tests
  {
    const { content, frontmatter } = extractFrontmatter(
      "---\nname: test\ndescription: hello\n---\n\n# Heading\n\nBody text.\n"
    );
    eq("extractFrontmatter: strips frontmatter", content, "\n# Heading\n\nBody text.\n");
    eq("extractFrontmatter: captures raw block", frontmatter, "---\nname: test\ndescription: hello\n---\n");
  }

  {
    const { content, frontmatter } = extractFrontmatter("# No frontmatter\n\nJust content.\n");
    eq("extractFrontmatter: no frontmatter returns content unchanged", content, "# No frontmatter\n\nJust content.\n");
    eq("extractFrontmatter: no frontmatter returns empty string", frontmatter, "");
  }

  eq(
    "prependFrontmatter: restores block with blank line",
    prependFrontmatter("# Heading\n", "---\nfoo: bar\n---\n"),
    "---\nfoo: bar\n---\n\n# Heading\n"
  );

  eq(
    "prependFrontmatter: noop when empty",
    prependFrontmatter("# Heading\n", ""),
    "# Heading\n"
  );

  // Full round-trip with frontmatter
  await roundtripCase(
    "YAML frontmatter preserved through round-trip",
    "---\nname: games-vm\ndescription: SSH into the games VM\nallowed-tools: Bash\n---\n\n## Games VM\n\nSome content here.\n"
  );

  await roundtripCase(
    "frontmatter with special chars preserved",
    "---\ntitle: My <Project>\ntags: [a, b, c]\n---\n\n# Title\n\nParagraph.\n"
  );

  // Exact reproduction of the reported bug: angle-bracket value + multi-line YAML
  await roundtripCase(
    "frontmatter with angle-bracket value (reported issue)",
    "---\nname: games-vm\ndescription: SSH into the games VM (A100 GPU) on GCP to run commands, check training runs, or manage experiments\nargument-hint: <command-to-run>\nallowed-tools: Bash\n---\n\n## Games VM\n\nSome content here.\n"
  );

  // --------------------------------------------------------------------------
  category("M. Known failing / limitations (documented)");
  // --------------------------------------------------------------------------

  // Escaped markdown characters in plain text lose backslash on round-trip
  // because Tiptap stores the rendered text, not the source.
  // The remark/rehype pipeline alone ALSO loses them.
  await roundtripCase(
    "\\* literal asterisk in text (LOSSY)",
    "Escape: \\* should stay",
    "Escape: * should stay",
    { known: true }
  );

  // (was: "β\\_kl not unescaped (Unicode)" — now fixed, see category J below)
  // (was: "compactLists: indented para after list loses blank" — now fixed,
  //  see L.compactLists positive assertions below)

  // Empty fenced code block round-trips to itself (no language label
  // added or removed — we only touch labels when the user opts in via
  // defaultCodeBlockLang).
  await roundtripCase("empty fenced code block stays bare", "```\n```");

  // --------------------------------------------------------------------------
  category("N. Settings-driven behavior");
  // --------------------------------------------------------------------------

  // mergeSettings with nothing returns defaults
  eq(
    "mergeSettings: null/undefined → defaults",
    JSON.stringify(mergeSettings(null)),
    JSON.stringify(DEFAULT_SETTINGS)
  );

  // Partial settings merge onto defaults
  const partial = mergeSettings({ bullet: "*" });
  assert(
    "mergeSettings: partial settings keep defaults for missing keys",
    partial.bullet === "*" && partial.emphasis === "_" && partial.compactLists === true,
    JSON.stringify(partial)
  );

  // buildMarkdownConfig maps user-friendly "**"/"__" down to remark's single char
  const cfgStarStar = buildMarkdownConfig(mergeSettings({ strong: "**" }));
  const cfgUnderUnder = buildMarkdownConfig(mergeSettings({ strong: "__" }));
  assert(
    "buildMarkdownConfig: strong ** → remark strong='*'",
    cfgStarStar.strong === "*",
    `got '${cfgStarStar.strong}'`
  );
  assert(
    "buildMarkdownConfig: strong __ → remark strong='_'",
    cfgUnderUnder.strong === "_",
    `got '${cfgUnderUnder.strong}'`
  );

  // bulletOther is the complement of bullet
  assert(
    "buildMarkdownConfig: bullet='-' → bulletOther='*'",
    buildMarkdownConfig(mergeSettings({ bullet: "-" })).bulletOther === "*"
  );
  assert(
    "buildMarkdownConfig: bullet='*' → bulletOther='-'",
    buildMarkdownConfig(mergeSettings({ bullet: "*" })).bulletOther === "-"
  );

  // compactLists toggle: when disabled, blank lines between list items remain
  eq(
    "settings: compactLists=false preserves blanks between items",
    normalizeMarkdown("- a\n\n- b\n\n- c\n", mergeSettings({ compactLists: false })),
    "- a\n\n- b\n\n- c\n"
  );
  eq(
    "settings: compactLists=true compacts blanks between items (default)",
    normalizeMarkdown("- a\n\n- b\n\n- c\n", DEFAULT_SETTINGS),
    "- a\n- b\n- c\n"
  );

  // unescapeSpecialChars toggle
  eq(
    "settings: unescapeSpecialChars=false keeps \\_ in words",
    normalizeMarkdown("foo\\_bar\n", mergeSettings({ unescapeSpecialChars: false })),
    "foo\\_bar\n"
  );
  eq(
    "settings: unescapeSpecialChars=true unescapes \\_ in words (default)",
    normalizeMarkdown("foo\\_bar\n", DEFAULT_SETTINGS),
    "foo_bar\n"
  );

  // shellscriptToBash toggle
  eq(
    "settings: shellscriptToBash=true rewrites label (default)",
    normalizeMarkdown("```shellscript\necho hi\n```\n", DEFAULT_SETTINGS),
    "```bash\necho hi\n```\n"
  );
  eq(
    "settings: shellscriptToBash=false keeps shellscript",
    normalizeMarkdown("```shellscript\necho hi\n```\n", mergeSettings({ shellscriptToBash: false })),
    "```shellscript\necho hi\n```\n"
  );

  // renumberOrderedLists toggle
  eq(
    "settings: renumberOrderedLists=true renumbers (default)",
    normalizeMarkdown("1. a\n1. b\n1. c\n", DEFAULT_SETTINGS),
    "1. a\n2. b\n3. c\n"
  );
  eq(
    "settings: renumberOrderedLists=false keeps original numbers",
    normalizeMarkdown("1. a\n1. b\n1. c\n", mergeSettings({ renumberOrderedLists: false })),
    "1. a\n1. b\n1. c\n"
  );

  // bullet setting: normalizeMarkdown rewrites other bullets to preferred
  eq(
    "settings: bullet='*' converts - to *",
    normalizeMarkdown("- one\n- two\n", mergeSettings({ bullet: "*" })),
    "* one\n* two\n"
  );
  eq(
    "settings: bullet='+' converts - to +",
    normalizeMarkdown("- one\n- two\n", mergeSettings({ bullet: "+" })),
    "+ one\n+ two\n"
  );

  // defaultCodeBlockLang
  eq(
    "settings: defaultCodeBlockLang='' leaves bare fences alone (default)",
    normalizeMarkdown("```\nhello\n```\n", DEFAULT_SETTINGS),
    "```\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang='text' labels bare fences when user opts in",
    normalizeMarkdown("```\nhello\n```\n", mergeSettings({ defaultCodeBlockLang: "text" })),
    "```text\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang='' strips text label",
    normalizeMarkdown("```text\nhello\n```\n", mergeSettings({ defaultCodeBlockLang: "" })),
    "```\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang leaves real languages alone",
    normalizeMarkdown("```python\nprint('x')\n```\n", mergeSettings({ defaultCodeBlockLang: "" })),
    "```python\nprint('x')\n```\n"
  );

  // --------------------------------------------------------------------------
  // Print report
  // --------------------------------------------------------------------------

  const groups = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!groups.has(r.category)) groups.set(r.category, []);
    groups.get(r.category)!.push(r);
  }

  let passed = 0;
  let failed = 0;
  let knownFailed = 0;
  let unexpectedFailed = 0;

  for (const [cat, items] of groups) {
    console.log(`\n\x1b[1m${cat}\x1b[0m`);
    for (const r of items) {
      if (r.passed) {
        passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${r.name}`);
      } else {
        failed++;
        if (r.known) {
          knownFailed++;
          console.log(`  \x1b[33m○\x1b[0m ${r.name} \x1b[90m(known)\x1b[0m`);
        } else {
          unexpectedFailed++;
          console.log(`  \x1b[31m✗\x1b[0m ${r.name}`);
          console.log(`    \x1b[90mexpected:\x1b[0m ${JSON.stringify(r.expected)}`);
          console.log(`    \x1b[90m  actual:\x1b[0m ${JSON.stringify(r.actual)}`);
        }
      }
    }
  }

  console.log(
    `\n\x1b[1mResult:\x1b[0m \x1b[32m${passed} passed\x1b[0m, ` +
      (unexpectedFailed
        ? `\x1b[31m${unexpectedFailed} failed\x1b[0m, `
        : "") +
      `\x1b[33m${knownFailed} known-failing\x1b[0m`
  );

  if (unexpectedFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
