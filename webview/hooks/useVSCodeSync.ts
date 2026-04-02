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

  // Convert task list HTML to BlockNote's native checkListItem format.
  // BlockNote has two parseHTML rules (one for <input>, one for <li>)
  // that both fire, creating duplicate blocks. Using native format avoids this.
  // First convert individual items, then strip the wrapping <ul>.
  html = html.replace(
    /<ul[^>]*class="contains-task-list"[^>]*>([\s\S]*?)<\/ul>/g,
    (_match, inner) => {
      return inner.replace(
        /<li[^>]*>\s*(?:<p>)?\s*<input type="checkbox"([^>]*?)>\s*([\s\S]*?)\s*(?:<\/p>)?\s*<\/li>/g,
        (_m: string, attrs: string, content: string) => {
          const checked = attrs.includes("checked");
          return `<div data-content-type="checkListItem" data-checked="${checked}">${content.trim()}</div>`;
        }
      );
    }
  );

  // Strip <p> wrappers inside <li> — loose lists (items separated by blank lines)
  // produce <li>\n<p>text</p>\n</li> which BlockNote misinterprets as nested blocks
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, "<li$1>$2</li>");

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

    // Strip <p> wrappers inside <li> to prevent remark-stringify from
    // producing loose lists (bare marker on one line, content on next)
    html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, "<li$1>$2</li>");

    // Convert BlockNote's checkListItem blocks to proper <ul><li> with checkbox
    // so rehype-remark produces "- [ ] text" instead of splitting them.
    // Use DOM parser for reliability since BlockNote nests multiple divs.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const checkItems = doc.querySelectorAll('[data-content-type="checkListItem"]');
    if (checkItems.length > 0) {
      checkItems.forEach((div) => {
        const input = div.querySelector("input[type=checkbox]");
        const checked = input?.hasAttribute("checked") ?? false;
        const p = div.querySelector("p");
        const content = p?.innerHTML?.trim() ?? div.textContent?.trim() ?? "";

        const li = doc.createElement("li");
        const checkbox = doc.createElement("input");
        checkbox.type = "checkbox";
        if (checked) checkbox.setAttribute("checked", "");
        li.appendChild(checkbox);
        li.append(" " + content);

        div.replaceWith(li);
      });
      // Wrap consecutive <li> (that were checkListItems) in <ul>
      const allLi = doc.body.querySelectorAll("li");
      let currentUl: HTMLUListElement | null = null;
      allLi.forEach((li) => {
        if (li.querySelector("input[type=checkbox]")) {
          if (!currentUl || li.previousElementSibling !== currentUl.lastElementChild) {
            currentUl = doc.createElement("ul");
            li.before(currentUl);
          }
          currentUl.appendChild(li);
        } else {
          currentUl = null;
        }
      });
      html = doc.body.innerHTML;
    }

    const result = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify, MARKDOWN_CONFIG)
      .process(html);
    md = normalizeMarkdown(String(result));
  } catch (err) {
    console.error("[better-markdown] Custom pipeline failed, using fallback:", err);
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

