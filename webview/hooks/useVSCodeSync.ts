import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

import { buildMarkdownConfig, normalizeMarkdown } from "../markdown.config";
import { DEFAULT_SETTINGS, type BetterMarkdownSettings } from "../settings";
import {
  mathHandlers,
  PIPE_PH,
  DOLLAR_PH,
  protectCurrencyDollars,
  protectTableCodePipes,
} from "../conversion-utils";

/**
 * Render markdown to plain HTML suitable for display (NOT for Tiptap
 * ingestion). Keeps native GFM output: real `<input type="checkbox">`
 * elements, `contains-task-list` class on <ul>, etc. Used by the rich
 * diff view where we render directly to the DOM without Tiptap.
 */
export async function markdownToDisplayHtml(md: string): Promise<string> {
  md = protectTableCodePipes(md);
  md = protectCurrencyDollars(md);
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(md);
  let html = String(result).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );
  return html;
}

export async function markdownToHtml(
  md: string,
  baseUri?: string
): Promise<string> {
  // Protect | inside code spans within table rows
  md = protectTableCodePipes(md);
  // Protect currency $ from remarkMath pairing
  md = protectCurrencyDollars(md);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: mathHandlers })
    .use(rehypeStringify)
    .process(md);

  // Restore placeholders
  let html = String(result).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");

  // Trim trailing newlines inside <code> blocks
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, content, close) => open + content.replace(/\n$/, "") + close
  );

  // Use DOMParser to fix HTML structure for Tiptap:
  // 1. Wrap bare text in <li> with <p> (Tiptap needs block content)
  // 2. Convert GFM task lists to Tiptap's taskItem format
  // 3. Ensure each <img> is in its own <p> block
  {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Wrap bare <li> text in <p>
    doc.querySelectorAll("li").forEach((li) => {
      const firstChild = li.childNodes[0];
      if (firstChild && firstChild.nodeType === Node.TEXT_NODE && firstChild.textContent?.trim()) {
        const p = doc.createElement("p");
        while (li.firstChild && !(li.firstChild as Element).tagName?.match(/^(UL|OL|DIV|BLOCKQUOTE|PRE|TABLE)$/i)) {
          p.appendChild(li.firstChild);
        }
        li.insertBefore(p, li.firstChild);
      }
    });

    // Convert GFM task list items to Tiptap taskItem format
    doc.querySelectorAll("li").forEach((li) => {
      const checkbox = li.querySelector("input[type=checkbox]");
      if (!checkbox) return;
      const checked = checkbox.hasAttribute("checked");
      checkbox.remove();
      // Remove leading whitespace after checkbox removal
      if (li.firstChild?.nodeType === Node.TEXT_NODE) {
        li.firstChild.textContent = li.firstChild.textContent?.replace(/^\s+/, "") || "";
      }
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", String(checked));
      // Ensure content is in <p>
      if (!li.querySelector("p")) {
        const p = doc.createElement("p");
        while (li.firstChild) p.appendChild(li.firstChild);
        li.appendChild(p);
      }
    });
    doc.querySelectorAll("ul").forEach((ul) => {
      if (ul.querySelector('li[data-type="taskItem"]')) {
        ul.setAttribute("data-type", "taskList");
      }
    });

    // Ensure each <img> is in its own <p> block (not inline with other images)
    doc.querySelectorAll("p").forEach((p) => {
      const imgs = p.querySelectorAll("img");
      if (imgs.length <= 1) return;
      const parent = p.parentNode;
      if (!parent) return;
      imgs.forEach((img, i) => {
        const wrapper = doc.createElement("p");
        wrapper.appendChild(img.cloneNode(true));
        parent.insertBefore(wrapper, p);
      });
      p.remove();
    });

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
 * Reshape Tiptap's HTML into the shape rehype-remark expects, ahead of
 * either a sync or async stringify step.
 */
function preprocessTiptapHtml(html: string): string {
  // Convert Tiptap task list HTML to standard GFM format for rehype-remark
  {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Convert math nodes to code/pre placeholders that protect LaTeX content
    // from remark-stringify escaping. Restored in postprocessMarkdown.
    doc.querySelectorAll('[data-type="mathInline"]').forEach((el) => {
      const latex = el.getAttribute("data-latex") || el.textContent || "";
      const code = doc.createElement("code");
      code.textContent = `BTRMK_MATH:${latex}`;
      el.replaceWith(code);
    });
    doc.querySelectorAll('[data-type="mathBlock"]').forEach((el) => {
      const latex = el.getAttribute("data-latex") || el.textContent || "";
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.className = "language-btrmk-math-block";
      code.textContent = latex;
      pre.appendChild(code);
      el.replaceWith(pre);
    });

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

  // NOTE: we deliberately do NOT escape `|` inside <code> within table cells
  // here. rehype-remark + remark-gfm already emit correct GFM escapes (`\|`)
  // for table cell code spans. Escaping manually leads to double-escape
  // (`\\|`) on round-trips.

  // Wrap bare <img> tags in <p> so each image gets its own paragraph
  // Tiptap outputs images as top-level <img> without <p> wrappers
  html = html.replace(/(?<!\w)(<img\s[^>]*>)/g, "<p>$1</p>");
  // Clean up any <p><p><img></p></p> double-wrapping
  html = html.replace(/<p>\s*<p>(<img\s[^>]*>)<\/p>\s*<\/p>/g, "<p>$1</p>");
  // Remove empty <p></p> between images
  html = html.replace(/<\/p>\s*<p>\s*<\/p>\s*<p>/g, "</p>\n<p>");

  return html;
}

function postprocessMarkdown(
  md: string,
  settings: BetterMarkdownSettings,
  baseUri?: string,
  docFolderPath?: string
): string {
  md = normalizeMarkdown(md, settings);
  // Restore math from code/pre placeholders (after normalizeMarkdown to avoid interference)
  md = md.replace(/`BTRMK_MATH:(.*?)`/g, (_m, latex) => `$${latex}$`);
  md = md.replace(/```btrmk-math-block\n([\s\S]*?)\n```/g, (_m, latex) => `$$\n${latex}\n$$`);
  // Replace HTML entities that leak through
  md = md.replace(/&#x20;/g, " ");
  md = md.replace(/&amp;/g, "&");
  // Strip BlockNote-style default alt text
  md = md.replace(/!\[BlockNote image\]/g, "![]");
  // Restore relative paths
  md = restoreRelativePaths(md, baseUri, docFolderPath);
  return md;
}

/**
 * Convert HTML from Tiptap editor back to markdown.
 */
export async function htmlToMarkdown(
  html: string,
  baseUri?: string,
  docFolderPath?: string,
  settings: BetterMarkdownSettings = DEFAULT_SETTINGS
): Promise<string> {
  html = preprocessTiptapHtml(html);
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, buildMarkdownConfig(settings))
    .process(html);
  return postprocessMarkdown(String(result), settings, baseUri, docFolderPath);
}

/**
 * Synchronous variant of htmlToMarkdown. Needed for the clipboard copy
 * handler, which has to call clipboardData.setData() inside the DOM event
 * (async writes aren't supported there without navigator.clipboard).
 */
export function htmlToMarkdownSync(
  html: string,
  baseUri?: string,
  docFolderPath?: string,
  settings: BetterMarkdownSettings = DEFAULT_SETTINGS
): string {
  html = preprocessTiptapHtml(html);
  const result = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, buildMarkdownConfig(settings))
    .processSync(html);
  return postprocessMarkdown(String(result), settings, baseUri, docFolderPath);
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

