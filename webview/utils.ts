/** True on macOS (Safari, Chrome, VS Code on Mac). Checked once at load. */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/** Match a KeyboardEvent against a user-configured binding string like
 *  `"Mod+/"`, `"Ctrl+Shift+B"`, `"Alt+P"`. `Mod` resolves to `Meta` on
 *  macOS, `Ctrl` elsewhere. Comparison is case-insensitive for the
 *  non-modifier key. Returns false for empty/invalid strings. */
export function matchesBinding(
  e: KeyboardEvent,
  binding: string | undefined | null,
): boolean {
  if (!binding) return false;
  const parts = binding
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const key = parts[parts.length - 1].toLowerCase();
  const mods = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));

  const wantCtrl = mods.has("ctrl") || (mods.has("mod") && !IS_MAC);
  const wantMeta = mods.has("meta") || mods.has("cmd") || (mods.has("mod") && IS_MAC);
  const wantShift = mods.has("shift");
  const wantAlt = mods.has("alt") || mods.has("option");

  if (!!e.ctrlKey !== wantCtrl) return false;
  if (!!e.metaKey !== wantMeta) return false;
  if (!!e.shiftKey !== wantShift) return false;
  if (!!e.altKey !== wantAlt) return false;

  // On macOS, Option+letter sets e.key to the produced character (e.g. "π"
  // for Option+P) instead of the base key. e.code is always the physical key
  // ("KeyP"), so use it when alt is held on Mac.
  const eventKey =
    wantAlt && IS_MAC && e.code.startsWith("Key")
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
  return eventKey === key;
}

/** If the editor selection is collapsed inside a text node, expand it to
 *  cover the word around the cursor. No-op when already non-empty or the
 *  cursor is not adjacent to word characters. */
export function selectWordAtCursor(editor: {
  state: {
    selection: {
      $from: {
        parent: { textContent: string };
        parentOffset: number;
        start: () => number;
      };
      empty: boolean;
    };
  };
  chain: () => {
    focus: () => {
      setTextSelection: (range: { from: number; to: number }) => {
        run: () => boolean;
      };
    };
  };
}): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty) return false;
  const text = $from.parent.textContent;
  const offset = $from.parentOffset;
  const wordChar = /[\p{L}\p{N}_]/u;
  let start = offset;
  let end = offset;
  while (start > 0 && wordChar.test(text[start - 1])) start--;
  while (end < text.length && wordChar.test(text[end])) end++;
  if (start === end) return false;
  const nodeStart = $from.start();
  editor
    .chain()
    .focus()
    .setTextSelection({ from: nodeStart + start, to: nodeStart + end })
    .run();
  return true;
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
