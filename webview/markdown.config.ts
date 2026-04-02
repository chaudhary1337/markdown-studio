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
  md = replaceEmphasis(md);
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");
  md = normalizeListIndent(md);
  md = indentedToFenced(md);
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
        if (result[p].trim() !== "") { prevLine = result[p]; break; }
      }
      let nextLine = "";
      for (let n = i + 1; n < lines.length; n++) {
        if (lines[n].trim() !== "") { nextLine = lines[n]; break; }
      }

      const prevIsList = LIST_ITEM.test(prevLine);
      const nextIsList = LIST_ITEM.test(nextLine);

      if (prevIsList && nextIsList) {
        // Keep blank line between different list types at top level
        const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const nextIndent = nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const sameType = (ORDERED.test(prevLine) && ORDERED.test(nextLine)) ||
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

/**
 * Replace *text* with _text_ for emphasis.
 * Skips code blocks, inline code, and **bold** (double asterisks).
 */
function replaceEmphasis(md: string): string {
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

    let processed = "";
    let remaining = line;
    while (remaining.length > 0) {
      const codeStart = remaining.indexOf("`");
      if (codeStart === -1) {
        processed += remaining.replace(/(?<!\*)\*(?!\*|\s)(.+?)(?<!\*|\s)\*(?!\*)/g, "_$1_");
        break;
      }
      processed += remaining.slice(0, codeStart).replace(/(?<!\*)\*(?!\*|\s)(.+?)(?<!\*|\s)\*(?!\*)/g, "_$1_");
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

/**
 * Convert 4-space list indentation to 2-space.
 * BlockNote uses 4-space indent; we prefer 2-space for compactness.
 */
function normalizeListIndent(md: string): string {
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

    // Match lines that start with spaces followed by a list marker
    const match = line.match(/^(\s+)([-*]|\d+\.)\s/);
    if (match) {
      const spaces = match[1];
      const level = Math.floor(spaces.length / 4);
      const remainder = spaces.length % 4;
      const newIndent = "  ".repeat(level) + " ".repeat(Math.min(remainder, 2));
      result.push(newIndent + line.trimStart());
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Convert indented code blocks (4 spaces) to fenced ``` blocks.
 * Tracks fenced code block state to avoid corrupting content inside fences.
 */
function indentedToFenced(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;
  let inFencedBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      inFencedBlock = !inFencedBlock;
      result.push(line);
      i++;
      continue;
    }

    if (inFencedBlock) {
      result.push(line);
      i++;
      continue;
    }

    if (/^(?:    |\t)\S/.test(line) || /^(?:    |\t)$/.test(line)) {
      // Skip if previous non-empty line is a list item
      let prevNonEmpty = "";
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].trim() !== "") { prevNonEmpty = result[j]; break; }
      }
      if (/^\s*[-*]\s/.test(prevNonEmpty) || /^\s*\d+\.\s/.test(prevNonEmpty)) {
        result.push(line);
        i++;
        continue;
      }

      const codeLines: string[] = [];
      while (i < lines.length && (/^(?:    |\t)/.test(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim() === "" && i + 1 < lines.length && !/^(?:    |\t)/.test(lines[i + 1])) break;
        codeLines.push(lines[i].replace(/^(?:    |\t)/, ""));
        i++;
      }
      while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === "") codeLines.pop();
      if (codeLines.length > 0) {
        result.push("```");
        result.push(...codeLines);
        result.push("```");
      }
    } else {
      result.push(line);
      i++;
    }
  }
  return result.join("\n");
}
