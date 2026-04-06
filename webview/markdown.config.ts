/**
 * Markdown formatting preferences.
 * These control how Tiptap's output is serialized back to markdown.
 *
 * See remark-stringify options:
 * https://github.com/remarkjs/remark/tree/main/packages/remark-stringify#options
 */
import { DEFAULT_SETTINGS, type BetterMarkdownSettings } from "./settings";

/**
 * Build a remark-stringify options object from user settings.
 * `strong` and `emphasis` are single-char in remark's API (the stringifier
 * doubles strong automatically), so we map our user-friendly `**`/`__` down.
 */
export function buildMarkdownConfig(settings: BetterMarkdownSettings = DEFAULT_SETTINGS) {
  return {
    bullet: settings.bullet,
    bulletOther: (settings.bullet === "-" ? "*" : "-") as "-" | "*" | "+",
    bulletOrdered: "." as const,
    listItemIndent: settings.listItemIndent,
    emphasis: settings.emphasis,
    strong: (settings.strong === "**" ? "*" : "_") as "*" | "_",
    fence: "`" as const,
    fences: true,
    rule: settings.rule,
  };
}

/** Back-compat export for the default config. */
export const MARKDOWN_CONFIG = buildMarkdownConfig(DEFAULT_SETTINGS);

/**
 * Post-process markdown to fix formatting issues
 * that remark-stringify doesn't handle correctly.
 *
 * Every step corresponds to a toggleable setting; passing no settings
 * uses the defaults (which enable everything).
 */
export function normalizeMarkdown(
  md: string,
  settings: BetterMarkdownSettings = DEFAULT_SETTINGS
): string {
  if (settings.shellscriptToBash) {
    md = md.replace(/^```shellscript$/gm, "```bash");
  }
  // Replace non-preferred bullet markers with the preferred one
  // (remark config handles this but bulletOther may still produce the other)
  const others = (["-", "*", "+"] as const).filter((b) => b !== settings.bullet);
  // Use a non-character-class alternation to sidestep regex-escape pitfalls
  const otherBulletsPattern = others.map((b) => (b === "*" ? "\\*" : b === "+" ? "\\+" : "-")).join("|");
  md = md.replace(
    new RegExp(`^(\\s*)(?:${otherBulletsPattern})\\s{1,3}`, "gm"),
    `$1${settings.bullet} `
  );
  // Normalize ordered list spacing: "1.  " → "1. "
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");
  md = fixTaskLists(md);
  if (settings.renumberOrderedLists) {
    md = renumberOrderedLists(md);
  }
  if (settings.fixTableHeaders) {
    md = fixTableHeaders(md);
  }
  if (settings.unescapeSpecialChars) {
    md = unescapeSpecialChars(md);
  }
  if (settings.dedupImageAltText) {
    md = md.replace(/(!\[([^\]]+)\]\([^)]+\))\n+\2\s*$/gm, "$1\n");
  }
  md = stripAutolinks(md);
  md = fixOrphanedListMarkers(md);
  if (settings.compactLists) {
    md = compactLists(md);
  }
  // Apply / strip default code block language label.
  md = applyDefaultCodeBlockLang(md, settings.defaultCodeBlockLang);
  return md;
}

/**
 * When the user picks a defaultCodeBlockLang, give bare ``` fences that
 * label. When it's empty, strip labels that look like our default ("text",
 * "plaintext") — never strip real languages.
 */
function applyDefaultCodeBlockLang(md: string, lang: string): string {
  const lines = md.split("\n");
  let fenceCount = 0; // 0 = outside, odd = just opened, even = closed
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)```([^\s`]*)\s*$/);
    if (!m) continue;
    fenceCount++;
    if (fenceCount % 2 === 0) continue; // closing fence
    const [, indent, existing] = m;
    if (!existing && lang) {
      lines[i] = `${indent}\`\`\`${lang}`;
    } else if (existing && !lang && (existing === "text" || existing === "plaintext")) {
      lines[i] = `${indent}\`\`\``;
    }
  }
  return lines.join("\n");
}

/**
 * Remove unnecessary backslash escapes that remark-stringify adds.
 * Specifically: \~, \*, \_ outside code blocks/spans.
 * Preserves real strikethrough (~~text~~) and emphasis markers.
 */
function unescapeSpecialChars(md: string): string {
  const lines = md.split("\n");
  let inCodeBlock = false;
  const result: string[] = [];

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Process outside inline code spans
    let processed = "";
    let remaining = line;
    while (remaining.length > 0) {
      const codeStart = remaining.indexOf("`");
      if (codeStart === -1) {
        processed += unescapeText(remaining);
        break;
      }
      processed += unescapeText(remaining.slice(0, codeStart));
      const codeEnd = remaining.indexOf("`", codeStart + 1);
      if (codeEnd === -1) {
        processed += remaining.slice(codeStart);
        break;
      }
      processed += remaining.slice(codeStart, codeEnd + 1);
      remaining = remaining.slice(codeEnd + 1);
    }
    result.push(processed);
  }
  return result.join("\n");
}

function unescapeText(text: string): string {
  // Remove backslash before ~ (remark-gfm escapes tildes)
  text = text.replace(/\\~/g, "~");
  // Remove backslash before * that isn't part of bold/emphasis markup
  // Only unescape standalone \* (e.g. "2 \* 3") not emphasis markers
  text = text.replace(/(?<=\s|^)\\\*(?=\s|$)/g, "*");
  // Remove backslash before _ inside words (e.g. future\_relevance → future_relevance)
  // but keep \_ at word boundaries where it prevents emphasis.
  // Use Unicode property escapes so non-ASCII letters (β, 日, 文…) count as
  // word chars — plain \w is ASCII-only.
  text = text.replace(/([\p{L}\p{N}_])\\_([\p{L}\p{N}_])/gu, "$1_$2");
  // Remove backslash before [ when not part of a link (remark escapes all [)
  text = text.replace(/\\\[/g, "[");
  // Remove backslash before = when followed by a non-= non-whitespace char
  // (remark escapes = to prevent setext headings, but "=> text" is never one)
  text = text.replace(/\\=(?=[^=\s])/g, "=");
  return text;
}

/**
 * Fix task list formatting. BlockNote produces patterns like:
 *   - \[ ] text   or   - [ ]\n\n    text
 * Merges them into: - [ ] text
 */
function fixTaskLists(md: string): string {
  md = md.replace(/^(\s*-\s)\\\[(\s)\\\]/gm, "$1[$2]");
  md = md.replace(/^(\s*-\s)\\\[([xX])\\\]/gm, "$1[$2]");
  md = md.replace(/^(\s*-\s)\\(\[[\sxX]\])/gm, "$1$2");

  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const checkboxMatch = line.match(/^(\s*-\s\[[\sxX]\])\s*$/);
    if (checkboxMatch) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim() !== "") {
        result.push(`${checkboxMatch[1]} ${lines[j].trim()}`);
        i = j + 1;
        continue;
      }
    }

    const indentedTask = line.match(/^\s{2,}(-\s\[[\sxX]\]\s*.*)$/);
    if (
      indentedTask &&
      result.length > 0 &&
      /^-\s*$/.test(result[result.length - 1].trim())
    ) {
      result.pop();
      result.push(indentedTask[1]);
      i++;
      continue;
    }

    result.push(line);
    i++;
  }

  // Remove blank lines between consecutive task list items
  const final: string[] = [];
  for (let k = 0; k < result.length; k++) {
    if (
      result[k].trim() === "" &&
      k > 0 &&
      /^-\s\[[\sxX]\]\s/.test(result[k - 1]) &&
      k + 1 < result.length &&
      /^-\s\[[\sxX]\]\s/.test(result[k + 1])
    ) {
      continue;
    }
    final.push(result[k]);
  }
  return final.join("\n");
}

/**
 * Renumber consecutive ordered list items.
 * BlockNote outputs each item as "1." — this fixes them to 1. 2. 3. etc.
 */
function renumberOrderedLists(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let counter = 0;
  let inList = false;
  let blankLineGap = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (match && match[1] === "") {
      counter++;
      inList = true;
      blankLineGap = false;
      result.push(`${counter}. ${match[3]}`);
    } else if (line.trim() === "" && inList) {
      blankLineGap = true;
      result.push(line);
    } else {
      if (line.trim() !== "" && !line.match(/^\s*\d+\.\s/)) {
        inList = false;
        counter = 0;
        blankLineGap = false;
      }
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Fix tables where rehype-remark adds an empty header row.
 */
function fixTableHeaders(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (/^\|.+\|/.test(lines[i])) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      if (
        tableLines.length >= 3 &&
        isEmptyRow(tableLines[0]) &&
        isSeparatorRow(tableLines[1])
      ) {
        const dataRows = tableLines.slice(2);
        result.push(dataRows[0]);
        result.push(buildSeparator(dataRows));
        result.push(...dataRows.slice(1));
      } else if (tableLines.length >= 2 && isSeparatorRow(tableLines[1])) {
        const dataRows = [tableLines[0], ...tableLines.slice(2)];
        result.push(tableLines[0]);
        result.push(buildSeparator(dataRows));
        result.push(...tableLines.slice(2));
      } else {
        result.push(...tableLines);
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join("\n");
}

function buildSeparator(rows: string[]): string {
  const colWidths: number[] = [];
  for (const row of rows) {
    const cells = splitTableRow(row);
    cells.forEach((cell, idx) => {
      colWidths[idx] = Math.max(colWidths[idx] || 3, cell.trim().length);
    });
  }
  return (
    "|" +
    colWidths.map((w) => " " + "-".repeat(Math.max(w, 3)) + " ").join("|") +
    "|"
  );
}

/** Split a markdown table row into cells, respecting | inside backtick spans. */
function splitTableRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  // Skip leading |
  let i = row.indexOf("|") + 1;
  for (; i < row.length; i++) {
    const ch = row[i];
    if (ch === "`") {
      inCode = !inCode;
      current += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  // Drop trailing empty cell (from trailing |)
  if (cells.length > 0 && current.trim() === "") return cells;
  if (current) cells.push(current);
  return cells;
}

function isEmptyRow(line: string): boolean {
  return /^\|(\s*\|)+\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*[-:]+[-|\s:]*$/.test(line);
}

/**
 * Strip angle-bracket autolinks (<https://…>) back to bare URLs.
 * GFM auto-links bare URLs identically, and users expect round-trip
 * to preserve the bare form they wrote.
 */
function stripAutolinks(md: string): string {
  const lines = md.split("\n");
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    // Process outside inline code spans
    let out = "";
    let remaining = lines[i];
    while (remaining.length > 0) {
      const tick = remaining.indexOf("`");
      if (tick === -1) {
        out += remaining.replace(/<(https?:\/\/[^\s>]+)>/g, "$1");
        break;
      }
      out += remaining.slice(0, tick).replace(/<(https?:\/\/[^\s>]+)>/g, "$1");
      const end = remaining.indexOf("`", tick + 1);
      if (end === -1) {
        out += remaining.slice(tick);
        break;
      }
      out += remaining.slice(tick, end + 1);
      remaining = remaining.slice(end + 1);
    }
    lines[i] = out;
  }
  return lines.join("\n");
}

/**
 * Fix orphaned list markers: bare "- " on its own line followed by
 * blank lines + content → merge into single line.
 */
function fixOrphanedListMarkers(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const markerMatch = lines[i].match(/^(\s*)-\s*$/);
    if (markerMatch) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim()) {
        result.push(`${markerMatch[1]}- ${lines[j].trim()}`);
        i = j + 1;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result.join("\n");
}

/**
 * Remove blank lines between consecutive list items to produce tight lists.
 * Preserves blank lines around non-list content.
 */
function compactLists(md: string): string {
  const LIST_ITEM = /^(\s*)(?:[-*]|\d+\.)\s/;
  const ORDERED = /^(\s*)\d+\.\s/;
  const UNORDERED = /^(\s*)[-*]\s/;
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) {
      result.push(lines[i]);
      continue;
    }

    if (lines[i].trim() === "") {
      let prevLine = "";
      for (let p = result.length - 1; p >= 0; p--) {
        if (result[p].trim() !== "") {
          prevLine = result[p];
          break;
        }
      }
      let nextLine = "";
      for (let n = i + 1; n < lines.length; n++) {
        if (lines[n].trim() !== "") {
          nextLine = lines[n];
          break;
        }
      }

      const prevIsList = LIST_ITEM.test(prevLine);
      const nextIsList = LIST_ITEM.test(nextLine);

      if (prevIsList && nextIsList) {
        // Keep blank line between different list types at top level
        const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const nextIndent = nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const sameType =
          (ORDERED.test(prevLine) && ORDERED.test(nextLine)) ||
          (UNORDERED.test(prevLine) && UNORDERED.test(nextLine));
        if (prevIndent === 0 && nextIndent === 0 && !sameType) {
          result.push(lines[i]); // keep the blank line
        }
        // else: skip (compact)
        continue;
      }
    }

    result.push(lines[i]);
  }
  return result.join("\n");
}
