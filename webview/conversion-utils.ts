/**
 * Shared conversion utilities used by both the production pipeline
 * (useVSCodeSync.ts, DOMParser-based) and the test pipeline
 * (test/pipeline.ts, regex-based).
 */

/** Custom remark-rehype handlers that convert remark-math AST nodes to HTML. */
export const mathHandlers = {
  inlineMath(_state: any, node: any) {
    return {
      type: "element",
      tagName: "span",
      properties: { dataType: "mathInline", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
  math(_state: any, node: any) {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "mathBlock", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
};

// Placeholder for | inside code spans in table rows.
// Remark's GFM table parser splits on | even inside backtick code,
// corrupting cells like `||value||`. We replace before parse, restore after.
export const PIPE_PH = "%%BTRMK_PIPE%%";

// Placeholder for currency $ signs (e.g. $14B, $1.4B).
// remarkMath pairs unrelated currency $s as inline math delimiters,
// eating bold markers and other formatting in between.
export const DOLLAR_PH = "%%BTRMK_DOLLAR%%";

/**
 * Protect currency $ signs from being parsed as math delimiters.
 * remarkMath pairs unrelated $14B ... $1.4B as inline math, eating
 * everything in between (including bold markers). Replace $ followed
 * by a digit with a placeholder before parsing; restore after HTML.
 */
export function protectCurrencyDollars(md: string): string {
  // Match $ followed by a digit, but not $$ (block math)
  return md.replace(/(?<!\$)\$(?=\d)(?!\$)/g, DOLLAR_PH);
}

/**
 * In table rows, replace | inside backtick code spans with a placeholder.
 * Remark's GFM table parser splits on | even inside code spans,
 * corrupting cells like `||value||`.
 */
export function protectTableCodePipes(md: string): string {
  const lines = md.split("\n");
  let inTable = false;

  return lines.map((line) => {
    // Detect table rows (start with |)
    if (/^\|/.test(line.trim())) {
      inTable = true;
    } else if (inTable && line.trim() !== "") {
      inTable = false;
    }

    if (!inTable) return line;

    // Replace | inside backtick code spans with placeholder
    let result = "";
    let inCode = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "`") {
        inCode = !inCode;
        result += "`";
      } else if (inCode && line[i] === "\\" && line[i + 1] === "|") {
        // Consume the `\` alongside `|` — otherwise the backslash survives
        // into the HTML and rehype-remark emits it verbatim, which combines
        // with remark-gfm's own \| escape to produce \\| on round-trips.
        result += PIPE_PH;
        i++;
      } else if (line[i] === "|" && inCode) {
        result += PIPE_PH;
      } else {
        result += line[i];
      }
    }
    return result;
  }).join("\n");
}
