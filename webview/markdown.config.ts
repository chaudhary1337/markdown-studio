/**
 * Markdown formatting preferences.
 * These control how BlockNote's output is serialized back to markdown.
 *
 * See remark-stringify options:
 * https://github.com/remarkjs/remark/tree/main/packages/remark-stringify#options
 */
export const MARKDOWN_CONFIG = {
  // Lists
  bullet: "-" as const,         // unordered list marker: "-" not "*"
  bulletOther: "*" as const,     // alternate marker for nested lists
  bulletOrdered: "." as const,   // ordered list marker style: "1."
  listItemIndent: "one" as const, // single space after marker, not 3

  // Emphasis
  emphasis: "_" as const,        // italics with _underscores_ not *stars*
  strong: "**" as const,         // bold with **double stars**

  // Code
  fence: "```" as const,         // fenced code blocks
  fences: true,                  // always use fences, never indented code blocks

  // Other
  rule: "---" as const,          // horizontal rule style
};

/**
 * Post-process markdown to fix formatting issues
 * that remark-stringify doesn't handle correctly.
 */
export function normalizeMarkdown(md: string): string {
  // 0. Normalize code block language names
  md = md.replace(/^```shellscript$/gm, "```bash");
  // 1. Convert indented code blocks to fenced (do this FIRST)
  md = indentedToFenced(md);
  // 2. Replace "* " or "*   " list markers with "- "
  md = md.replace(/^(\s*)\*\s{1,3}/gm, "$1- ");
  // 3. Replace *text* emphasis with _text_ (but not in code spans or **bold**)
  md = replaceEmphasis(md);
  // 4. Normalize ordered lists: "1.  " to "1. " (single space)
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");
  // 5. Fix task list checkboxes (escaped brackets and formatting)
  md = fixTaskLists(md);
  // 6. Renumber ordered lists (BlockNote restarts each item at 1)
  md = renumberOrderedLists(md);
  // 6. Fix table headers (BlockNote flattens <thead> into regular rows)
  md = fixTableHeaders(md);
  // 7. Remove duplicate image captions (BlockNote outputs caption as both
  //    alt text and as a separate line after the image)
  md = md.replace(/(!\[([^\]]+)\]\([^)]+\))\n+\2\s*$/gm, "$1\n");
  return md;
}

/**
 * Fix task list formatting:
 * - Unescape brackets: \[ ] → [ ], \[x] → [x]
 * - Ensure proper "- [ ] " / "- [x] " format
 * - Flatten nested task lists to flat sequential items
 */
function fixTaskLists(md: string): string {
  // Fix escaped brackets in task lists
  md = md.replace(/^(\s*-\s)\\(\[[\sx]\])(\s*)/gm, "$1$2 ");
  md = md.replace(/^(\s*-\s)\\\[(\s)\\\]/gm, "$1[$2]");
  md = md.replace(/^(\s*-\s)\\\[([xX])\\\]/gm, "$1[$2]");

  // Flatten: if task list items are indented under a blank bullet, flatten them
  const lines = md.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect indented task items (e.g., "  - [ ] text") that follow a bare "- " line
    const indentedTask = line.match(/^\s{2,}(-\s\[[\sx]\]\s.*)$/);
    if (indentedTask && result.length > 0) {
      const prev = result[result.length - 1];
      // If previous line is a bare empty list item, replace it and flatten
      if (/^-\s*$/.test(prev.trim())) {
        result.pop();
        result.push(indentedTask[1]);
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}

/**
 * Renumber consecutive ordered list items.
 * BlockNote outputs each item as "1." — this fixes them to 1. 2. 3. etc.
 * Handles items separated by blank lines (loose lists) as one sequence.
 */
function renumberOrderedLists(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let counter = 0;
  let inList = false;
  let blankLineGap = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(\d+)\.\s(.*)$/);

    if (match) {
      const [, indent, , content] = match;
      // Only renumber top-level items (no indent)
      if (indent === "") {
        counter++;
        inList = true;
        blankLineGap = false;
        result.push(`${counter}. ${content}`);
      } else {
        result.push(line);
      }
    } else if (line.trim() === "" && inList) {
      // Blank line within a list — keep tracking
      blankLineGap = true;
      result.push(line);
    } else {
      // Non-list line after a blank gap means list ended
      if (inList && (!blankLineGap || line.trim() === "")) {
        // Still could be in the list
      }
      if (line.trim() !== "" && !line.match(/^(\s*)\d+\.\s/)) {
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
 * Replace *text* with _text_ for emphasis, but skip:
 * - code blocks (``` ... ```)
 * - inline code (`...`)
 * - **bold** (double asterisks)
 * - standalone * used as multiplication or bullets
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

    // Process line: split by inline code spans to protect them
    let processed = "";
    let remaining = line;
    while (remaining.length > 0) {
      const codeStart = remaining.indexOf("`");
      if (codeStart === -1) {
        // No more code spans — process the rest
        processed += convertEmphasisInText(remaining);
        break;
      }
      // Process text before the code span
      processed += convertEmphasisInText(remaining.slice(0, codeStart));
      // Find the closing backtick
      const codeEnd = remaining.indexOf("`", codeStart + 1);
      if (codeEnd === -1) {
        // Unclosed backtick — just append the rest
        processed += remaining.slice(codeStart);
        break;
      }
      // Append code span unchanged
      processed += remaining.slice(codeStart, codeEnd + 1);
      remaining = remaining.slice(codeEnd + 1);
    }
    result.push(processed);
  }
  return result.join("\n");
}

function convertEmphasisInText(text: string): string {
  // Match *text* but not **text** and not standalone *
  return text.replace(/(?<!\*)\*(?!\*|\s)(.+?)(?<!\*|\s)\*(?!\*)/g, "_$1_");
}

/**
 * Convert indented code blocks (4 spaces / tab) to fenced ``` blocks.
 */
function indentedToFenced(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Check if this line is indented code (4 spaces or tab)
    // and NOT inside a list (previous non-empty line doesn't start with - or digit.)
    if (/^(?:    |\t)\S/.test(line) || /^(?:    |\t)$/.test(line)) {
      // Look back: if prev non-empty line is a list item, skip (it's list continuation)
      let prevNonEmpty = "";
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].trim() !== "") {
          prevNonEmpty = result[j];
          break;
        }
      }
      if (/^\s*[-*]\s/.test(prevNonEmpty) || /^\s*\d+\.\s/.test(prevNonEmpty)) {
        result.push(line);
        i++;
        continue;
      }

      // Collect all indented lines
      const codeLines: string[] = [];
      while (i < lines.length && (/^(?:    |\t)/.test(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim() === "" && i + 1 < lines.length && !/^(?:    |\t)/.test(lines[i + 1])) {
          break; // End of code block
        }
        codeLines.push(lines[i].replace(/^(?:    |\t)/, ""));
        i++;
      }
      // Trim trailing empty lines
      while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === "") {
        codeLines.pop();
      }
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

/**
 * Fix tables where rehype-remark adds an empty header row.
 * Pattern: empty row | separator | data rows → remove empty row, promote first data row to header.
 */
function fixTableHeaders(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (/^\|.+\|/.test(lines[i])) {
      // Collect entire table block
      const tableLines: string[] = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      // Check for the pattern: empty header row + separator + data rows
      // Empty row: all cells are whitespace only (e.g., "|       |       |")
      if (
        tableLines.length >= 3 &&
        isEmptyRow(tableLines[0]) &&
        isSeparatorRow(tableLines[1])
      ) {
        // Remove empty header, make first data row the new header
        const dataRows = tableLines.slice(2);
        const separator = buildSeparator(dataRows);
        result.push(dataRows[0]);
        result.push(separator);
        result.push(...dataRows.slice(1));
      } else if (isSeparatorRow(tableLines[1])) {
        // Table already has a separator — rebuild it to match column widths
        const dataRows = [tableLines[0], ...tableLines.slice(2)];
        const separator = buildSeparator(dataRows);
        result.push(tableLines[0]);
        result.push(separator);
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

/**
 * Build a separator row (| --- | --- |) with dashes matching column widths.
 */
function buildSeparator(rows: string[]): string {
  // Parse cells from each row to find max width per column
  const colWidths: number[] = [];
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1); // remove leading/trailing empty
    cells.forEach((cell, idx) => {
      const width = cell.trim().length;
      colWidths[idx] = Math.max(colWidths[idx] || 3, width);
    });
  }
  // Build separator with dashes padded to column width
  const parts = colWidths.map((w) => " " + "-".repeat(Math.max(w, 3)) + " ");
  return "|" + parts.join("|") + "|";
}

function isEmptyRow(line: string): boolean {
  // A row where all cells contain only whitespace
  return /^\|(\s*\|)+\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*[-:]+[-|\s:]*$/.test(line);
}
