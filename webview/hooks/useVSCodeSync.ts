import { BlockNoteEditor, Block } from "@blocknote/core";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

/**
 * Convert markdown string to BlockNote blocks.
 * We do our own md -> HTML pipeline to avoid BlockNote's buggy
 * internal parser (crashes on code blocks without a language).
 */
export async function markdownToBlocks(
  editor: BlockNoteEditor,
  md: string
): Promise<Block<any, any, any>[]> {
  // Markdown -> HTML via remark/rehype
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
 */
export async function blocksToMarkdown(
  editor: BlockNoteEditor
): Promise<string> {
  // Try the built-in method first
  try {
    return await editor.blocksToMarkdownLossy(editor.document);
  } catch {
    // Fallback: blocks -> HTML -> markdown
    const html = await editor.blocksToHTMLLossy(editor.document);
    const result = await unified()
      .use(rehypeParse)
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify)
      .process(html);
    return String(result);
  }
}
