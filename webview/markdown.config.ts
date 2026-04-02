/**
 * Markdown formatting preferences.
 * These control how BlockNote's output is serialized back to markdown.
 *
 * See remark-stringify options:
 * https://github.com/remarkjs/remark/tree/main/packages/remark-stringify#options
 */
export const MARKDOWN_CONFIG = {
  bullet: "-" as const,
  bulletOther: "*" as const,
  bulletOrdered: "." as const,
  listItemIndent: "one" as const,
  emphasis: "_" as const,
  strong: "*" as const,
  fence: "`" as const,
  fences: true,
  rule: "-" as const,
};

/**
 * Post-process markdown to fix formatting issues
 * that remark-stringify doesn't handle correctly.
 */
export function normalizeMarkdown(md: string): string {
  md = md.replace(/^```shellscript$/gm, "```bash");
  md = md.replace(/^(\s*)\*\s{1,3}/gm, "$1- ");
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");
  md = fixTaskLists(md);
  md = renumberOrderedLists(md);
  md = fixTableHeaders(md);
  md = unescapeSpecialChars(md);
  md = md.replace(/(!\[([^\]]+)\]\([^)]+\))\n+\2\s*$/gm, "$1\n");
  md = fixOrphanedListMarkers(md);
  md = compactLists(md);
  return md;
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
    if (indentedTask && result.length > 0 && /^-\s*$/.test(result[result.length - 1].trim())) {
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
      k > 0 && /^-\s\[[\sxX]\]\s/.test(result[k - 1]) &&
      k + 1 < result.length && /^-\s\[[\sxX]\]\s/.test(result[k + 1])
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

      if (tableLines.length >= 3 && isEmptyRow(tableLines[0]) && isSeparatorRow(tableLines[1])) {
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
    const cells = row.split("|").slice(1, -1);
    cells.forEach((cell, idx) => {
      colWidths[idx] = Math.max(colWidths[idx] || 3, cell.trim().length);
    });
  }
  return "|" + colWidths.map((w) => " " + "-".repeat(Math.max(w, 3)) + " ").join("|") + "|";
}

function isEmptyRow(line: string): boolean {
  return /^\|(\s*\|)+\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*[-:]+[-|\s:]*$/.test(line);
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
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) {
      result.push(lines[i]);
      continue;
    }

    // Skip blank lines that sit between two list items
    if (lines[i].trim() === "") {
      // Look backward for a list item
      let prevList = false;
      for (let p = result.length - 1; p >= 0; p--) {
        if (result[p].trim() === "") continue;
        prevList = LIST_ITEM.test(result[p]);
        break;
      }
      // Look forward for a list item
      let nextList = false;
      for (let n = i + 1; n < lines.length; n++) {
        if (lines[n].trim() === "") continue;
        nextList = LIST_ITEM.test(lines[n]);
        break;
      }
      if (prevList && nextList) continue; // skip this blank line
    }

    result.push(lines[i]);
  }
  return result.join("\n");
}
