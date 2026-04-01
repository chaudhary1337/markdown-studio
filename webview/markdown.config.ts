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
  // 3. Replace *text* emphasis with _text_ (but not **bold**)
  md = md.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "_$1_");
  // 4. Normalize ordered lists: "1.  " to "1. " (single space)
  md = md.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");
  // 5. Fix table headers (BlockNote flattens <thead> into regular rows)
  md = fixTableHeaders(md);
  return md;
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
        const newHeader = tableLines[2];
        const cols = (newHeader.match(/\|/g) || []).length - 1;
        const separator = "|" + " --- |".repeat(Math.max(cols, 1));
        result.push(newHeader);
        result.push(separator);
        result.push(...tableLines.slice(3));
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

function isEmptyRow(line: string): boolean {
  // A row where all cells contain only whitespace
  return /^\|(\s*\|)+\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*[-:]+[-|\s:]*$/.test(line);
}
