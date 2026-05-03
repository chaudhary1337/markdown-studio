/**
 * Markdown Studio user settings.
 *
 * Storage: VS Code's native configuration system, namespace
 * `betterMarkdown.*`. The schema is declared in package.json's
 * `contributes.configuration` and the defaults below MUST stay in sync.
 * Users can edit via the Settings UI, `.vscode/settings.json`, or the
 * in-app SettingsPanel — all three write to the same store.
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

  // --- shortcuts ---
  /**
   * Keybinding that opens the selection bubble menu. If the cursor is
   * inside a word with no active selection, the shortcut expands the
   * selection to the surrounding word first so the menu has something to
   * anchor to. Format: modifier+key chain separated by `+` (e.g.
   * `Mod+/`, `Ctrl+Shift+B`). `Mod` resolves to `Meta` on macOS, `Ctrl`
   * elsewhere. Empty string disables the shortcut.
   */
  bubbleMenuShortcut: string;
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
  bubbleMenuShortcut: "Mod+/",
};

/**
 * Authoritative list of every settings key. Host-side code iterates this
 * to read/write VS Code config without duplicating the list.
 */
export const SETTING_KEYS: (keyof BetterMarkdownSettings)[] = [
  "bullet",
  "emphasis",
  "strong",
  "rule",
  "listItemIndent",
  "compactLists",
  "unescapeSpecialChars",
  "renumberOrderedLists",
  "shellscriptToBash",
  "fixTableHeaders",
  "dedupImageAltText",
  "defaultCodeBlockLang",
  "diffLayout",
  "diffMode",
  "autoSave",
  "bubbleMenuShortcut",
];

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
