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
 * Convert markdown to HTML for Tiptap editor.
 */
export async function markdownToHtml(
  md: string,
  baseUri?: string
): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);

  let html = String(result);

  // Ensure all <code> inside <pre> have a language class
  html = html.replace(
    /<pre><code(?![^>]*class="language-)/g,
    '<pre><code class="language-text"'
  );

  // Trim trailing newlines inside <code> blocks
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, content, close) => open + content.replace(/\n$/, "") + close
  );

  // Wrap bare text inside <li> with <p> tags and compact the HTML.
  // Tiptap's ProseMirror parser needs: <li><p>text</p><ul>...</ul></li>
  // with NO whitespace between </p> and <ul>. Newlines between tags
  // create text nodes that break ProseMirror's content parsing.
  {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("li").forEach((li) => {
      const firstChild = li.childNodes[0];
      // If first child is a text node (bare text, no <p>), wrap it
      if (firstChild && firstChild.nodeType === Node.TEXT_NODE && firstChild.textContent?.trim()) {
        const p = doc.createElement("p");
        // Move all inline nodes into <p> until we hit a block element
        while (li.firstChild && !(li.firstChild as Element).tagName?.match(/^(UL|OL|DIV|BLOCKQUOTE|PRE|TABLE)$/i)) {
          p.appendChild(li.firstChild);
        }
        li.insertBefore(p, li.firstChild);
      }
    });
    // Re-serialize — innerHTML produces compact HTML without extra whitespace
    html = doc.body.innerHTML;
  }

  // Resolve relative image paths to webview URIs
  if (baseUri) {
    html = html.replace(
      /<img\s([^>]*?)src="([^"]+)"/g,
      (_m, before, src) => {
        if (/^https?:\/\/|^data:/.test(src)) return `<img ${before}src="${src}"`;
        return `<img ${before}src="${baseUri.replace(/\/$/, "")}/${src}"`;
      }
    );
  }

  return html;
}

/**
 * Convert HTML from Tiptap editor back to markdown.
 */
export async function htmlToMarkdown(
  html: string,
  baseUri?: string,
  docFolderPath?: string
): Promise<string> {
  // Convert Tiptap task list HTML to standard GFM format for rehype-remark
  {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
      const checked = li.getAttribute("data-checked") === "true";
      const label = li.querySelector("label");
      if (label) label.remove();
      const div = li.querySelector("div");
      const content = div?.innerHTML || li.innerHTML;
      if (div) div.remove();
      const checkbox = doc.createElement("input");
      checkbox.type = "checkbox";
      if (checked) checkbox.setAttribute("checked", "");
      li.innerHTML = "";
      li.appendChild(checkbox);
      li.append(" ");
      const span = doc.createElement("span");
      span.innerHTML = content.replace(/<\/?p>/g, "");
      while (span.firstChild) li.appendChild(span.firstChild);

      li.removeAttribute("data-type");
      li.removeAttribute("data-checked");
    });
    doc.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
      ul.classList.add("contains-task-list");
      ul.removeAttribute("data-type");
    });
    html = doc.body.innerHTML;
  }

  // Strip <p> from inside <li> so rehype-remark produces tight lists
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");

  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, MARKDOWN_CONFIG)
    .process(html);

  let md = normalizeMarkdown(String(result));

  // Strip BlockNote-style default alt text
  md = md.replace(/!\[BlockNote image\]/g, "![]");

  // Restore relative paths
  md = restoreRelativePaths(md, baseUri, docFolderPath);

  return md;
}

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
    const folder = docFolderPath.replace(/\/$/, "") + "/";
    const resPrefix = "https://file+.vscode-resource.vscode-cdn.net" + folder;
    md = md.replace(new RegExp(escapeRegExp(resPrefix), "g"), "");
    const encPrefix = "https://file+.vscode-resource.vscode-cdn.net" + encodeURI(folder);
    md = md.replace(new RegExp(escapeRegExp(encPrefix), "g"), "");
  }

  md = md.replace(
    /https:\/\/file\+\.vscode-resource\.vscode-cdn\.net(\/[^\s)]+)/g,
    (_m, absPath) => {
      if (docFolderPath) {
        const folder = docFolderPath.replace(/\/$/, "") + "/";
        const decoded = decodeURI(absPath);
        if (decoded.startsWith(folder)) return decoded.slice(folder.length);
      }
      return absPath.split("/").pop() || absPath;
    }
  );

  return md;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
