import type { BetterMarkdownSettings } from "./settings";

/** CSS value for the user-selected rich-editor background surface. Returns
 *  a `var(...)` expression for VS Code palette options, a hex for `custom`,
 *  or undefined to fall back to the default editor background. */
export function resolveEditorSurface(
  s: Pick<BetterMarkdownSettings, "editorSurface" | "editorSurfaceCustom">,
): string | undefined {
  switch (s.editorSurface) {
    case "editor":
      return undefined;
    case "sideBar":
      return "var(--vscode-sideBar-background)";
    case "panel":
      return "var(--vscode-panel-background)";
    case "input":
      return "var(--vscode-input-background)";
    case "editorWidget":
      return "var(--vscode-editorWidget-background)";
    case "textBlockQuote":
      return "var(--vscode-textBlockQuote-background)";
    case "custom":
      return s.editorSurfaceCustom || undefined;
  }
}

/** Scroll an element (by id) into view, accounting for sticky headings. */
export function scrollToBlock(id: string) {
  const el =
    document.getElementById(id) || document.querySelector(`[data-id="${id}"]`);
  const container = document.querySelector(".editor-container");
  if (!el || !container) return;

  const stickyEl = container.querySelector(".sticky-headings");
  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const elTop = el.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  const offset = elTop - containerTop + container.scrollTop - stickyHeight;

  container.scrollTo({ top: offset, behavior: "smooth" });
}
