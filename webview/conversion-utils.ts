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
 *
 * Inline math whose content starts with a digit (e.g. `$24 \times 5 = 120$`)
 * looks identical to a currency `$` at the opening boundary. We disambiguate
 * by inspecting the closing `$` on the same line: if the `$...$` content
 * contains LaTeX-like syntax (a `\command`, sub/superscript, or operator with
 * a letter operand), we treat it as math and leave both `$`s alone. Otherwise
 * we treat the `$` as currency and protect it.
 */
export function protectCurrencyDollars(md: string): string {
  return md.split("\n").map(protectCurrencyInLine).join("\n");
}

function protectCurrencyInLine(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (
      line[i] === "$" &&
      line[i - 1] !== "$" &&
      line[i + 1] !== "$" &&
      /\d/.test(line[i + 1] || "")
    ) {
      const close = findClosingDollar(line, i + 1);
      if (close !== -1 && looksLikeMath(line.slice(i + 1, close))) {
        // Preserve the entire $...$ math span untouched
        out += line.slice(i, close + 1);
        i = close + 1;
        continue;
      }
      out += DOLLAR_PH;
      i++;
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

function findClosingDollar(line: string, from: number): number {
  for (let j = from; j < line.length; j++) {
    if (line[j] === "$" && line[j - 1] !== "\\" && line[j + 1] !== "$") {
      return j;
    }
  }
  return -1;
}

function looksLikeMath(content: string): boolean {
  // Markdown bold/italic markers inside the span are a strong signal that the
  // surrounding `$`s are currency adjacent to formatted text, not a math pair.
  if (/\*\*|__/.test(content)) return false;
  // LaTeX command (\times, \frac, \alpha, ...)
  if (/\\[a-zA-Z]/.test(content)) return true;
  // Sub/superscript
  if (/[\^_]/.test(content)) return true;
  // Equation form: ` = ` (spaces around =) — common in math, rare in currency
  if (/\s=\s/.test(content)) return true;
  // Operator (excluding `*`, which is also markdown's bold marker) with a
  // letter operand on either side (e.g. `2x + 3 = y`).
  if (/[a-zA-Z]\s*[+\-/=]\s*\S/.test(content)) return true;
  if (/\S\s*[+\-/=]\s*[a-zA-Z]/.test(content)) return true;
  return false;
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
