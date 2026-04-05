import React, { useEffect, useMemo, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { html as diff2html } from "diff2html";
import htmldiff from "node-htmldiff";
import { markdownToHtml } from "../hooks/useVSCodeSync";

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
  // Async because markdownToHtml resolves the remark pipeline.
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [renderedErr, setRenderedErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "rendered" || noChanges) return;
    let cancelled = false;
    (async () => {
      try {
        setRenderedErr(null);
        const [oldHtml, newHtml] = await Promise.all([
          markdownToHtml(oldContent),
          markdownToHtml(newContent),
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

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-title">
            {title ?? "Diff vs HEAD"} · {fileName}
          </span>
        </div>
        <div className="diff-toolbar-right">
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
