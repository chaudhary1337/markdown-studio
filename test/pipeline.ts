/**
 * Shared test pipeline: markdown → HTML → markdown round-trip.
 *
 * Mirrors the core conversion in webview/hooks/useVSCodeSync.ts using regex-
 * based transforms (DOMParser isn't available in Node). This exercises:
 *   - remark/rehype pipelines (the real conversion engines)
 *   - normalizeMarkdown post-processing
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
import {
  mathHandlers,
  PIPE_PH,
  DOLLAR_PH,
  protectCurrencyDollars,
  protectTableCodePipes,
} from "../webview/conversion-utils";
import { extractFrontmatter, prependFrontmatter } from "../webview/frontmatter";
import { isYouTubeUrl } from "../webview/extensions/YouTubeEmbed";
import { isGitHubUrl } from "../webview/extensions/GitHubEmbed";

export interface RoundTripOptions {}

/**
 * Full round-trip: markdown → HTML → markdown.
 */
export async function roundTrip(
  md: string,
  opts: RoundTripOptions = {}
): Promise<string> {
  // 1. Extract frontmatter
  const { content: noFm, frontmatter } = extractFrontmatter(md);
  const content = noFm;

  // 2. Protect | inside code spans in table rows + currency $
  let protectedMd = protectTableCodePipes(content);
  protectedMd = protectCurrencyDollars(protectedMd);

  // 3. md → HTML
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(protectedMd);
  let html = String(htmlResult).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");

  // 4. Apply Tiptap-mirror transforms (same as test-roundtrip.ts)
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );

  // Detect standalone autolink paragraphs as YouTube/GitHub embeds
  // (mirrors the DOMParser-based step in useVSCodeSync.markdownToHtml).
  html = html.replace(
    /<p>\s*<a href="([^"]+)">\1<\/a>\s*<\/p>/g,
    (match, href) => {
      if (isYouTubeUrl(href))
        return `<p data-type="youtubeEmbed" data-url="${href}">${href}</p>`;
      if (isGitHubUrl(href))
        return `<p data-type="githubEmbed" data-url="${href}">${href}</p>`;
      return match;
    }
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

  // 8. Restore frontmatter
  output = prependFrontmatter(output, frontmatter);

  return output;
}

/**
 * md → HTML only (core remark/rehype pipeline).
 */
export async function mdToHtml(md: string): Promise<string> {
  let protectedMd = protectTableCodePipes(md);
  protectedMd = protectCurrencyDollars(protectedMd);
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(protectedMd);
  let html = String(htmlResult).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );
  // Mirror the production embed detection (DOMParser-based in useVSCodeSync)
  // using the same regex we use inside roundTrip.
  html = html.replace(
    /<p>\s*<a href="([^"]+)">\1<\/a>\s*<\/p>/g,
    (match, href) => {
      if (isYouTubeUrl(href))
        return `<p data-type="youtubeEmbed" data-url="${href}">${href}</p>`;
      if (isGitHubUrl(href))
        return `<p data-type="githubEmbed" data-url="${href}">${href}</p>`;
      return match;
    }
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
