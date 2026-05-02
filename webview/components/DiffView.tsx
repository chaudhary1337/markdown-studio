import React, { useEffect, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { html as diff2html } from "diff2html";
import htmldiff from "node-htmldiff";
import katex from "katex";
import { markdownToDisplayHtml } from "../hooks/useVSCodeSync";

export type DiffMode = "source" | "rendered";
export type DiffLayout = "unified" | "side-by-side";

/**
 * Wrap math nodes and GFM checkboxes in a `<video>` sentinel before
 * htmldiff. (Yes, `<video>` — see why below.)
 *
 * htmldiff's default token-key function only includes attributes for a few
 * special tags: `<img>` (src), `<a>` (href), `<object>` (data),
 * `<iframe>` (src), and `<svg>/<math>/<video>` (full token). Everything
 * else collapses to just `<tagname>`, so two `<span data-latex="a^2">`
 * vs `<span data-latex="b^2">` look identical to it — same with
 * `<input type="checkbox">` vs `<input type="checkbox" checked>`.
 *
 * `<video>` is the only one of those three that DOMParser parses as a
 * regular HTML element (no foreign-content / MathML / SVG namespace
 * switch), so attributes round-trip cleanly. Wrapping changed nodes in
 * a `<video>` forces htmldiff to emit a `<del>`/`<ins>` pair around the
 * wrapper, which is exactly the before/after view we want. The wrappers
 * are replaced with their real rendering in postprocessAfterDiff before
 * the user ever sees the DOM.
 */
const SENTINEL_TAG = "video";

function preprocessForDiff(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  // Math nodes first — math inside a task item gets folded into the task
  // sentinel below as encoded HTML, which preserves it through the diff.
  doc
    .querySelectorAll('[data-type="mathInline"], [data-type="mathBlock"]')
    .forEach((el) => {
      const latex = el.getAttribute("data-latex") || el.textContent || "";
      const kind = el.getAttribute("data-type") === "mathBlock" ? "block" : "inline";
      const wrap = doc.createElement(SENTINEL_TAG);
      wrap.setAttribute("data-btrmk-math", kind);
      wrap.setAttribute("data-btrmk-latex", latex);
      wrap.textContent = latex;
      el.replaceWith(wrap);
    });

  // Task list items: collapse the entire <li> body into a single sentinel
  // whose text content is "☐ <line text>" or "☑ <line text>". This makes
  // htmldiff treat the whole line atomically, so a checkbox-only or
  // text-only change shows the full "[ ] foo" → "[x] foo" diff with the
  // line's text repeated on both sides — instead of just the checkbox
  // input wrapped in <del>/<ins> with an unchanged label trailing it.
  doc.querySelectorAll("li.task-list-item").forEach((li) => {
    const checkbox = li.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    const checked = checkbox.hasAttribute("checked");
    const innerHtml = li.innerHTML;
    const lineText = (li.textContent || "").trim();
    const wrap = doc.createElement(SENTINEL_TAG);
    wrap.setAttribute("data-btrmk-task", checked ? "on" : "off");
    // Stash the original HTML so post-processing can restore it verbatim;
    // encodeURIComponent escapes < and > (and quotes via %22) so the
    // attribute value is safe.
    wrap.setAttribute("data-btrmk-html", encodeURIComponent(innerHtml));
    wrap.textContent = (checked ? "☑ " : "☐ ") + lineText;
    li.innerHTML = "";
    li.appendChild(wrap);
  });

  // Stray checkboxes outside task items (defensive — GFM only emits
  // checkboxes inside task list items, but raw HTML in source could).
  doc.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    const checked = input.hasAttribute("checked");
    const wrap = doc.createElement(SENTINEL_TAG);
    wrap.setAttribute("data-btrmk-checkbox", checked ? "on" : "off");
    wrap.textContent = checked ? "☑" : "☐";
    input.replaceWith(wrap);
  });

  return doc.body.innerHTML;
}

/**
 * Inverse of `preprocessForDiff`: replace each `<video>` sentinel in the
 * htmldiff output with the proper rendered element. `<del>`/`<ins>`
 * wrappers around the sentinel (added by htmldiff for changed nodes) are
 * preserved, so the user sees old (red strike) and new (green underline)
 * versions side by side.
 */
function postprocessAfterDiff(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  // Task-item sentinels go FIRST. The decoded HTML may contain math
  // sentinels (math nested inside a task line), which the next loop
  // picks up as live DOM nodes.
  doc.querySelectorAll(`${SENTINEL_TAG}[data-btrmk-task]`).forEach((wrap) => {
    const encoded = wrap.getAttribute("data-btrmk-html") || "";
    const inner = decodeURIComponent(encoded);
    const tmp = doc.createElement("span");
    tmp.innerHTML = inner;
    const fragment = doc.createDocumentFragment();
    while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
    wrap.replaceWith(fragment);
  });

  doc.querySelectorAll(`${SENTINEL_TAG}[data-btrmk-math]`).forEach((wrap) => {
    const kind = wrap.getAttribute("data-btrmk-math");
    const latex = wrap.getAttribute("data-btrmk-latex") || "";
    const display = kind === "block";
    const tag = display ? "div" : "span";
    const out = doc.createElement(tag);
    out.setAttribute("data-type", display ? "mathBlock" : "mathInline");
    out.setAttribute("data-latex", latex);
    try {
      out.innerHTML = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: display,
      });
    } catch {
      out.textContent = latex;
    }
    wrap.replaceWith(out);
  });

  doc.querySelectorAll(`${SENTINEL_TAG}[data-btrmk-checkbox]`).forEach((wrap) => {
    const checked = wrap.getAttribute("data-btrmk-checkbox") === "on";
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.disabled = true;
    if (checked) input.setAttribute("checked", "");
    wrap.replaceWith(input);
  });

  return doc.body.innerHTML;
}

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  fileName: string;
  layout: DiffLayout;
  mode: DiffMode;
  onClose: () => void;
  onLayoutChange: (layout: DiffLayout) => void;
  onModeChange: (mode: DiffMode) => void;
  title?: string; // e.g. "Diff vs HEAD" or "abc123 → def456"
}

export function DiffView({
  oldContent,
  newContent,
  fileName,
  layout,
  mode,
  onClose,
  onLayoutChange,
  onModeChange,
  title,
}: DiffViewProps) {
  const noChanges = oldContent === newContent;

  // Source-level diff (line-based via diff2html)
  const sourceHtml = useMemo(() => {
    if (mode !== "source" || noChanges) return "";
    const patch = createTwoFilesPatch(
      fileName,
      fileName,
      oldContent,
      newContent,
      "",
      "",
      { context: 3 },
    );
    return diff2html(patch, {
      drawFileList: false,
      outputFormat: layout === "unified" ? "line-by-line" : "side-by-side",
      matching: "lines",
      colorScheme: "dark" as any,
    });
  }, [mode, oldContent, newContent, fileName, layout, noChanges]);

  // Rendered (HTML) diff — markdown → HTML for both sides, then htmldiff.
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [renderedErr, setRenderedErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "rendered" || noChanges) return;
    let cancelled = false;
    (async () => {
      try {
        setRenderedErr(null);
        const [oldHtml, newHtml] = await Promise.all([
          markdownToDisplayHtml(oldContent),
          markdownToDisplayHtml(newContent),
        ]);
        if (cancelled) return;
        const oldPre = preprocessForDiff(oldHtml);
        const newPre = preprocessForDiff(newHtml);
        const diffed = htmldiff(oldPre, newPre);
        const final = postprocessAfterDiff(diffed);
        setRenderedHtml(final);
      } catch (e: any) {
        if (!cancelled) setRenderedErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, oldContent, newContent, noChanges]);

  // --- Navigation through rendered-diff hunks ---
  // node-htmldiff tags each logical change with data-operation-index="N".
  // We collect the first element of each group, sort by DOM order, and let
  // the user step through with Prev/Next (and j/k / ArrowUp/ArrowDown).
  const renderedRef = useRef<HTMLDivElement | null>(null);
  const [hunks, setHunks] = useState<HTMLElement[]>([]);
  // -1 = nothing focused yet. Only becomes a real index once the user
  // presses Prev/Next, so the diff doesn't auto-highlight the first
  // hunk on open.
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (mode !== "rendered" || !renderedHtml) {
      setHunks([]);
      setCursor(-1);
      return;
    }
    // Wait for the DOM to be populated after setting innerHTML
    const id = requestAnimationFrame(() => {
      const root = renderedRef.current;
      if (!root) return;
      const all = Array.from(
        root.querySelectorAll<HTMLElement>("[data-operation-index]"),
      );
      // Keep only the first element per op-index (usually the outermost)
      const seen = new Set<string>();
      const firsts: HTMLElement[] = [];
      for (const el of all) {
        const idx = el.getAttribute("data-operation-index");
        if (!idx || seen.has(idx)) continue;
        seen.add(idx);
        firsts.push(el);
      }
      setHunks(firsts);
      setCursor(-1);
    });
    return () => cancelAnimationFrame(id);
  }, [renderedHtml, mode]);

  // Apply "current" class to the focused hunk and scroll it into view.
  // Skipped when cursor === -1 (initial state, no user navigation yet).
  // We manually scroll the .diff-body container instead of using
  // scrollIntoView, which walks the ancestor chain and can shift outer
  // scroll containers (e.g. the editor-container in integrated mode).
  useEffect(() => {
    hunks.forEach((el, i) => {
      if (i === cursor) el.classList.add("diff-hunk-current");
      else el.classList.remove("diff-hunk-current");
    });
    if (cursor < 0) return;
    const el = hunks[cursor];
    const body = renderedRef.current?.parentElement;
    if (!el || !body) return;
    const bodyRect = body.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const target =
      body.scrollTop +
      (elRect.top - bodyRect.top) -
      (body.clientHeight - elRect.height) / 2;
    body.scrollTo({
      top: Math.max(0, target),
      behavior: "smooth",
    });
  }, [hunks, cursor]);

  const gotoHunk = (delta: number) => {
    if (hunks.length === 0) return;
    setCursor((c) => {
      // First press: land on 0 (Next) or last (Prev) instead of wrapping
      if (c < 0) return delta > 0 ? 0 : hunks.length - 1;
      return (c + delta + hunks.length) % hunks.length;
    });
  };

  // Keyboard shortcuts while the diff is open
  useEffect(() => {
    if (mode !== "rendered" || hunks.length === 0) return;
    const h = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        gotoHunk(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        gotoHunk(-1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode, hunks.length]);

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-title">
            {title ?? "Diff vs HEAD"} · {fileName}
          </span>
        </div>
        <div className="diff-toolbar-right">
          {mode === "rendered" && hunks.length > 0 && (
            <div className="diff-nav">
              <button
                className="diff-nav-btn"
                onClick={() => gotoHunk(-1)}
                title="Previous change (k / ↑)"
                aria-label="Previous change"
              >
                ↑
              </button>
              <span className="diff-nav-counter">
                {cursor < 0 ? "—" : cursor + 1} / {hunks.length}
              </span>
              <button
                className="diff-nav-btn"
                onClick={() => gotoHunk(1)}
                title="Next change (j / ↓)"
                aria-label="Next change"
              >
                ↓
              </button>
            </div>
          )}
          <div className="settings-segmented">
            <button
              className={
                "settings-segment" + (mode === "source" ? " active" : "")
              }
              onClick={() => onModeChange("source")}
              title="Line-by-line diff of the raw markdown"
            >
              Source
            </button>
            <button
              className={
                "settings-segment" + (mode === "rendered" ? " active" : "")
              }
              onClick={() => onModeChange("rendered")}
              title="Word-level diff of the rendered HTML"
            >
              Rendered
            </button>
          </div>
          {mode === "source" && (
            <div className="settings-segmented">
              <button
                className={
                  "settings-segment" + (layout === "unified" ? " active" : "")
                }
                onClick={() => onLayoutChange("unified")}
              >
                Unified
              </button>
              <button
                className={
                  "settings-segment" +
                  (layout === "side-by-side" ? " active" : "")
                }
                onClick={() => onLayoutChange("side-by-side")}
              >
                Side-by-side
              </button>
            </div>
          )}
          <button className="diff-close" onClick={onClose} title="Close diff">
            ×
          </button>
        </div>
      </div>
      <div className="diff-body">
        {noChanges ? (
          <div className="diff-empty">No changes</div>
        ) : mode === "source" ? (
          <div
            className="diff-html"
            dangerouslySetInnerHTML={{ __html: sourceHtml }}
          />
        ) : renderedErr ? (
          <div className="diff-empty">Rendered diff failed: {renderedErr}</div>
        ) : renderedHtml ? (
          <div
            ref={renderedRef}
            className="diff-rendered"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <div className="diff-empty">Rendering…</div>
        )}
      </div>
    </div>
  );
}
