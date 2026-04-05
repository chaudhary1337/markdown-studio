import React, { useMemo } from "react";
import { createTwoFilesPatch } from "diff";
import { html as diff2html } from "diff2html";

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  fileName: string;
  layout: "unified" | "side-by-side";
  onClose: () => void;
  onLayoutChange: (layout: "unified" | "side-by-side") => void;
}

export function DiffView({
  oldContent,
  newContent,
  fileName,
  layout,
  onClose,
  onLayoutChange,
}: DiffViewProps) {
  const html = useMemo(() => {
    if (oldContent === newContent) return "";
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
  }, [oldContent, newContent, fileName, layout]);

  const noChanges = oldContent === newContent;

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-title">Diff vs HEAD · {fileName}</span>
        </div>
        <div className="diff-toolbar-right">
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
          <button className="diff-close" onClick={onClose} title="Close diff">
            ×
          </button>
        </div>
      </div>
      <div className="diff-body">
        {noChanges ? (
          <div className="diff-empty">No changes since HEAD</div>
        ) : (
          <div
            className="diff-html"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
