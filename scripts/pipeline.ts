/**
 * Shared test pipeline: markdown → HTML → markdown round-trip.
 *
 * Mirrors the core conversion in webview/hooks/useVSCodeSync.ts using regex-
 * based transforms (DOMParser isn't available in Node). This exercises:
 *   - remark/rehype pipelines (the real conversion engines)
 *   - normalizeMarkdown post-processing
 *   - metadata extract/restore/append
 *
 * Intentionally OMITTED (Tiptap-only structural transforms — rehype-remark
 * already emits correct markdown without them):
 *   - escapeCodePipesInTableCells (rehype-remark escapes `|` in table cell
 *     code spans natively via remark-gfm)
 *   - GFM task list ↔ Tiptap taskItem conversion (task list markdown round-
 *     trips directly through remark-gfm)
 *   - Multi-image paragraph splitting (remark already produces one `<p>` per
 *     image)
 *
 * The tests in test-conversions.ts cover the Tiptap-specific transforms
 * separately via targeted HTML fixtures.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import { MARKDOWN_CONFIG, normalizeMarkdown } from "../webview/markdown.config";

/** Custom remark-rehype handlers for math nodes (mirrors useVSCodeSync.ts). */
const mathHandlers = {
  inlineMath(_state: any, node: any) {
    return {
      type: "element",
      tagName: "span",
      properties: { dataType: "mathInline", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
  math(_state: any, node: any) {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "mathBlock", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
};
import {
  extractMeta,
  buildMeta,
  restoreHeadings,
  appendMeta,
  mergeMetadata,
} from "../webview/metadata";
import { extractFrontmatter, prependFrontmatter } from "../webview/frontmatter";

const PIPE_PH = "%%BTRMK_PIPE%%";

/**
 * Protect `|` inside backtick code spans within table rows so remark-gfm
 * doesn't split on them. Mirrors protectTableCodePipes in useVSCodeSync.ts.
 */
function protectTableCodePipes(md: string): string {
  const lines = md.split("\n");
  let inTable = false;
  return lines
    .map((line) => {
      if (/^\|/.test(line.trim())) {
        inTable = true;
      } else if (inTable && line.trim() !== "") {
        inTable = false;
      }
      if (!inTable) return line;
      let result = "";
      let inCode = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "`") {
          inCode = !inCode;
          result += "`";
        } else if (inCode && line[i] === "\\" && line[i + 1] === "|") {
          // \\| inside code → pipe placeholder (strip the backslash too,
          // otherwise it leaks into the HTML as a literal backslash and
          // remark-stringify double-escapes on output)
          result += PIPE_PH;
          i++;
        } else if (line[i] === "|" && inCode) {
          result += PIPE_PH;
        } else {
          result += line[i];
        }
      }
      return result;
    })
    .join("\n");
}

export interface RoundTripOptions {
  skipMeta?: boolean;
}

/**
 * Full round-trip: markdown → HTML → markdown.
 */
export async function roundTrip(
  md: string,
  opts: RoundTripOptions = {}
): Promise<string> {
  // 1. Extract frontmatter and metadata
  const { content: noFm, frontmatter } = extractFrontmatter(md);
  let content = noFm;
  let meta = { h: [] as { t: string; l: number }[] };
  if (!opts.skipMeta) {
    const extracted = extractMeta(content);
    const scanned = buildMeta(extracted.content);
    content = extracted.content;
    meta = mergeMetadata(scanned, extracted.meta);
  }

  // 2. Protect | inside code spans in table rows
  const protectedMd = protectTableCodePipes(content);

  // 3. md → HTML
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(protectedMd);
  let html = String(htmlResult).replace(new RegExp(PIPE_PH, "g"), "|");

  // 4. Apply Tiptap-mirror transforms (same as test-roundtrip.ts)
  html = html.replace(/<(\/?)h[456](\s|>)/g, "<$1h3$2"); // h4-h6 → h3
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );

  // Convert math HTML to code placeholders (mirrors preprocessTiptapHtml)
  html = html.replace(
    /<span data-type="mathInline" data-latex="[^"]*">([^<]*)<\/span>/g,
    "<code>BTRMK_MATH:$1</code>"
  );
  html = html.replace(
    /<div data-type="mathBlock" data-latex="[^"]*">([^<]*)<\/div>/g,
    '<pre><code class="language-btrmk-math-block">$1</code></pre>'
  );

  // 5. Strip <p> from <li> again (after re-entering pipeline)
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");

  // 6. HTML → md
  const mdResult = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, MARKDOWN_CONFIG)
    .process(html);
  let output = normalizeMarkdown(String(mdResult));

  // 6b. Restore math from placeholders
  output = output.replace(/`BTRMK_MATH:(.*?)`/g, (_m, latex) => `$${latex}$`);
  output = output.replace(/```btrmk-math-block\n([\s\S]*?)\n```/g, (_m, latex) => `$$\n${latex}\n$$`);

  // 7. HTML entity cleanup
  output = output.replace(/&#x20;/g, " ");
  output = output.replace(/&amp;/g, "&");

  // 8. Restore h4-h6 and append metadata
  if (!opts.skipMeta) {
    output = restoreHeadings(output, meta);
    output = appendMeta(output, meta);
  }

  // 9. Restore frontmatter
  output = prependFrontmatter(output, frontmatter);

  return output;
}

/**
 * md → HTML only (core remark/rehype pipeline).
 */
export async function mdToHtml(md: string): Promise<string> {
  const protectedMd = protectTableCodePipes(md);
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(protectedMd);
  let html = String(htmlResult).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );
  return html;
}

/**
 * HTML → md only (core rehype/remark pipeline).
 */
export async function htmlToMd(html: string): Promise<string> {
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");
  const mdResult = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, MARKDOWN_CONFIG)
    .process(html);
  let md = normalizeMarkdown(String(mdResult));
  md = md.replace(/&#x20;/g, " ");
  md = md.replace(/&amp;/g, "&");
  return md;
}
