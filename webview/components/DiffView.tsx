import React, { useEffect, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { html as diff2html } from "diff2html";
import htmldiff from "node-htmldiff";
import { markdownToDisplayHtml } from "../hooks/useVSCodeSync";

export type DiffMode = "source" | "rendered";
export type DiffLayout = "unified" | "side-by-side";

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
        const diffed = htmldiff(oldHtml, newHtml);
        setRenderedHtml(diffed);
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
  useEffect(() => {
    hunks.forEach((el, i) => {
      if (i === cursor) el.classList.add("diff-hunk-current");
      else el.classList.remove("diff-hunk-current");
    });
    if (cursor < 0) return;
    const el = hunks[cursor];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
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
