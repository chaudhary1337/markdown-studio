/**
 * Round-trip test: markdown → HTML → markdown
 *
 * Tests the remark/rehype pipeline and normalizeMarkdown without needing
 * a browser or BlockNote. Catches most formatting regressions.
 *
 * Usage: npx tsx scripts/test-roundtrip.ts [file.md]
 */

import { readFileSync } from "fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import { MARKDOWN_CONFIG, normalizeMarkdown } from "../webview/markdown.config";
import { extractMeta, buildMeta, restoreHeadings, appendMeta, mergeMetadata } from "../webview/metadata";

const file = process.argv[2] || "test.md";
const input = readFileSync(file, "utf-8");

async function roundTrip(md: string): Promise<string> {
  // 1. Extract metadata
  const { content, meta: existingMeta } = extractMeta(md);
  const scannedMeta = buildMeta(content);
  const meta = mergeMetadata(scannedMeta, existingMeta);

  // 2. md → HTML (same pipeline as markdownToBlocks)
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(content);
  let html = String(htmlResult);

  // 3. Apply the same HTML transforms as markdownToBlocks
  html = html.replace(/<(\/?)h[456](\s|>)/g, "<$1h3$2");
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, "<li$1>$2</li>");
  html = html.replace(/<pre><code(?![^>]*class="language-)/g, '<pre><code class="language-text"');
  html = html.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close);

  // 4. HTML → md (same pipeline as blocksToMarkdown)
  // Also strip <p> inside <li> on output path
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, "<li$1>$2</li>");
  const mdResult = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, MARKDOWN_CONFIG)
    .process(html);
  let output = normalizeMarkdown(String(mdResult));

  // 5. Restore h4-h6 and append metadata
  output = restoreHeadings(output, meta);
  output = appendMeta(output, meta);

  return output;
}

function showDiff(input: string, output: string) {
  const inLines = input.split("\n");
  const outLines = output.split("\n");
  const maxLen = Math.max(inLines.length, outLines.length);
  let diffs = 0;

  for (let i = 0; i < maxLen; i++) {
    const a = inLines[i] ?? "";
    const b = outLines[i] ?? "";
    if (a !== b) {
      diffs++;
      console.log(`\x1b[33mL${i + 1}:\x1b[0m`);
      console.log(`  \x1b[31m- ${a}\x1b[0m`);
      console.log(`  \x1b[32m+ ${b}\x1b[0m`);
    }
  }

  if (diffs === 0) {
    console.log("\x1b[32m✓ Round-trip clean — no differences\x1b[0m");
  } else {
    console.log(`\n\x1b[33m${diffs} line(s) differ\x1b[0m`);
  }
}

(async () => {
  console.log(`Testing round-trip: ${file}\n`);
  const output = await roundTrip(input);
  showDiff(input, output);
  console.log("\n--- Full output ---\n");
  console.log(output);
})();
