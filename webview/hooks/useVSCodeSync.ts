import { BlockNoteEditor, Block } from "@blocknote/core";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

// Remark-stringify options for clean, consistent markdown output
const STRINGIFY_OPTIONS = {
  bullet: "-" as const,
  bulletOther: "*" as const,
  bulletOrdered: "." as const,
  emphasis: "*" as const,
  strong: "**" as const,
  fence: "```" as const,
  fences: true,
  listItemIndent: "one" as const,
  rule: "---" as const,
};

/**
 * Convert markdown string to BlockNote blocks.
 * We do our own md -> HTML pipeline to avoid BlockNote's buggy
 * internal parser (crashes on code blocks without a language).
 */
export async function markdownToBlocks(
  editor: BlockNoteEditor,
  md: string
): Promise<Block<any, any, any>[]> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);

  let html = String(result);

  // Sanitize: ensure all <code> inside <pre> have a language class
  // BlockNote crashes on <pre><code> without class="language-*"
  html = html.replace(
    /<pre><code(?![^>]*class="language-)/g,
    '<pre><code class="language-text"'
  );

  return editor.tryParseHTMLToBlocks(html);
}

/**
 * Convert BlockNote blocks back to markdown.
 * Always uses our own pipeline with controlled remark-stringify options
 * to ensure fenced code blocks, consistent list markers, and correct indentation.
 */
export async function blocksToMarkdown(
  editor: BlockNoteEditor
): Promise<string> {
  const html = await editor.blocksToHTMLLossy(editor.document);
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, STRINGIFY_OPTIONS)
    .process(html);
  return String(result);
}
