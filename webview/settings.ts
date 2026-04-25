/**
 * Better Markdown user settings.
 *
 * Storage: VSCode extension-host globalState. The webview sends
 * saveSettings messages; the host writes to globalState and echoes updated
 * settings back to every open panel.
 *
 * Applied at two points in the pipeline:
 *   1. remark-stringify config (bullet, emphasis, strong, rule, indent)
 *   2. normalizeMarkdown post-processing (each normalization step is
 *      independently toggleable).
 */

export interface BetterMarkdownSettings {
  // --- remark-stringify markers (Editor → markdown serialization) ---
  /** Bullet character for unordered lists. */
  bullet: "-" | "*" | "+";
  /** Emphasis marker for italic. */
  emphasis: "_" | "*";
  /** Strong marker for bold. */
  strong: "**" | "__";
  /** Horizontal-rule character. Rendered as three of whichever you pick. */
  rule: "-" | "*" | "_";
  /** List item continuation indent. */
  listItemIndent: "one" | "tab" | "mixed";

  // --- normalizeMarkdown toggles ---
  /** Remove blank lines between consecutive list items (tight lists). */
  compactLists: boolean;
  /** Strip redundant \~, \*, \_, \[ escapes added by remark-stringify. */
  unescapeSpecialChars: boolean;
  /** Renumber ordered list items to 1., 2., 3., …. */
  renumberOrderedLists: boolean;
  /** Rewrite code fences labelled `shellscript` → `bash`. */
  shellscriptToBash: boolean;
  /** Rebuild table headers when rehype-remark emits an empty header row. */
  fixTableHeaders: boolean;
  /** Collapse `![alt](x)\nalt` → `![alt](x)` (image followed by its alt). */
  dedupImageAltText: boolean;

  // --- code blocks ---
  /**
   * Language label applied to unlabelled code blocks. "" leaves them bare
   * (```\n...\n```), "text" / "plaintext" adds a default label.
   */
  defaultCodeBlockLang: string;

  // --- diff view ---
  /** Layout for the source (line-level) diff toggle. */
  diffLayout: "unified" | "side-by-side";
  /** Default diff view mode: source (line diff) or rendered (HTML diff). */
  diffMode: "source" | "rendered";

  // --- saving ---
  /**
   * Save the file silently on open to persist the normalization round-trip
   * (md → html → md) that the rich editor applies. Only fires once per
   * open; subsequent edits follow VS Code's own `files.autoSave` /
   * manual-save behavior so we don't fight the user's configured cadence.
   */
  autoSave: boolean;

  // --- appearance ---
  /**
   * Background surface for the rich editor pane. Pulled from VS Code theme
   * tokens so it follows the active theme, or a user-supplied hex when
   * `custom`. Only affects the rich editor surface — margins, scrollbar,
   * status bar, and TOC stay on the default editor background so the
   * editor body visually separates from surrounding VS Code chrome.
   */
  editorSurface:
    | "editor"
    | "sideBar"
    | "panel"
    | "input"
    | "editorWidget"
    | "textBlockQuote"
    | "custom";
  /** Hex color used when `editorSurface === "custom"`. */
  editorSurfaceCustom: string;
}

export const DEFAULT_SETTINGS: BetterMarkdownSettings = {
  bullet: "-",
  emphasis: "_",
  strong: "**",
  rule: "-",
  listItemIndent: "one",
  compactLists: true,
  unescapeSpecialChars: true,
  renumberOrderedLists: true,
  shellscriptToBash: true,
  fixTableHeaders: true,
  dedupImageAltText: true,
  // Leave bare ``` fences alone — don't add a language label unless the
  // user explicitly opts in via the settings panel.
  defaultCodeBlockLang: "",
  diffLayout: "side-by-side",
  diffMode: "rendered",
  autoSave: true,
  editorSurface: "editor",
  editorSurfaceCustom: "#1e1e1e",
};

/**
 * Merge partial (possibly older/stale) settings onto defaults so missing
 * keys always have a sensible value.
 */
export function mergeSettings(
  partial: Partial<BetterMarkdownSettings> | null | undefined
): BetterMarkdownSettings {
  if (!partial) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...partial };
}
