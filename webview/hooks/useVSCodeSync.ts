import { BlockNoteEditor, Block } from "@blocknote/core";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

import { MARKDOWN_CONFIG, normalizeMarkdown } from "../markdown.config";

/**
 * Convert markdown string to BlockNote blocks.
 * We do our own md -> HTML pipeline to avoid BlockNote's buggy
 * internal parser (crashes on code blocks without a language).
 */
export async function markdownToBlocks(
  editor: BlockNoteEditor,
  md: string,
  baseUri?: string
): Promise<Block<any, any, any>[]> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);

  let html = String(result);

  // Downgrade h4-h6 to h3 (BlockNote only supports h1-h3)
  html = html.replace(/<(\/?)h[456](\s|>)/g, "<$1h3$2");

  // Sanitize: ensure all <code> inside <pre> have a language class
  // BlockNote crashes on <pre><code> without class="language-*"
  html = html.replace(
    /<pre><code(?![^>]*class="language-)/g,
    '<pre><code class="language-text"'
  );

  // Trim trailing newlines inside <code> blocks to prevent extra empty lines
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_match, open, content, close) => open + content.replace(/\n$/, "") + close
  );

  // Convert <img alt="caption"> to <figure><img><figcaption> for BlockNote
  // Remove alt attr to prevent duplication (BlockNote stores caption separately)
  html = html.replace(
    /<img\s([^>]*?)alt="([^"]+)"([^>]*?)>/g,
    (_match, before, alt, after) => {
      // Skip if already inside a <figure>
      return `<figure><img ${before}${after}><figcaption>${alt}</figcaption></figure>`;
    }
  );

  // Resolve relative image paths to webview URIs
  if (baseUri) {
    html = html.replace(
      /<img\s([^>]*?)src="([^"]+)"/g,
      (_match, before, src) => {
        if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
          return `<img ${before}src="${src}"`;
        }
        const resolved = baseUri.replace(/\/$/, "") + "/" + src;
        return `<img ${before}src="${resolved}"`;
      }
    );
  }

  return editor.tryParseHTMLToBlocks(html);
}

/**
 * Convert BlockNote blocks back to markdown.
 * Strips webview URI prefixes to restore original relative image paths.
 */
export async function blocksToMarkdown(
  editor: BlockNoteEditor,
  baseUri?: string,
  docFolderPath?: string
): Promise<string> {
  let md: string;

  try {
    let html = await editor.blocksToHTMLLossy(editor.document);
    // Strip <figure>/<figcaption> wrappers — leave bare <img alt="caption">
    // so rehype-remark produces clean ![caption](url) without duplication
    html = html.replace(/<figcaption>[\s\S]*?<\/figcaption>/g, "");
    html = html.replace(/<\/?figure>/g, "");
    const result = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify, MARKDOWN_CONFIG)
      .process(html);
    md = normalizeMarkdown(String(result));
  } catch (err) {
    console.error("Custom markdown pipeline failed, using fallback:", err);
    md = await editor.blocksToMarkdownLossy(editor.document);
    md = normalizeMarkdown(md);
  }

  // Strip BlockNote's default alt text, keep real captions
  md = md.replace(/!\[BlockNote image\]/g, "![]");

  // Restore relative paths by stripping all webview URI prefixes
  md = restoreRelativePaths(md, baseUri, docFolderPath);

  return md;
}

/**
 * Strip all webview URI prefixes to restore original relative paths.
 */
function restoreRelativePaths(
  md: string,
  baseUri?: string,
  docFolderPath?: string
): string {
  if (baseUri) {
    const prefix = baseUri.replace(/\/$/, "") + "/";
    md = md.replace(new RegExp(escapeRegExp(prefix), "g"), "");
  }

  if (docFolderPath) {
    const folderWithSlash = docFolderPath.replace(/\/$/, "") + "/";
    const resourcePrefix =
      "https://file+.vscode-resource.vscode-cdn.net" + folderWithSlash;
    md = md.replace(new RegExp(escapeRegExp(resourcePrefix), "g"), "");
    const encodedPrefix =
      "https://file+.vscode-resource.vscode-cdn.net" +
      encodeURI(folderWithSlash);
    md = md.replace(new RegExp(escapeRegExp(encodedPrefix), "g"), "");
  }

  md = md.replace(
    /https:\/\/file\+\.vscode-resource\.vscode-cdn\.net(\/[^\s)]+)/g,
    (_match, absPath) => {
      if (docFolderPath) {
        const folderWithSlash = docFolderPath.replace(/\/$/, "") + "/";
        const decoded = decodeURI(absPath);
        if (decoded.startsWith(folderWithSlash)) {
          return decoded.slice(folderWithSlash.length);
        }
      }
      const parts = absPath.split("/");
      return parts[parts.length - 1];
    }
  );

  return md;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
