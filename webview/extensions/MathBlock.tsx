import React, { useState, useEffect, useRef, useCallback } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import katex from "katex";

function MathBlockView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: any) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [latex, setLatex] = useState(node.attrs.latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Enter editing mode when the node is selected (click or arrow-key nav)
  useEffect(() => {
    if (selected && !editing) setEditing(true);
  }, [selected]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      // Delay focus so ProseMirror doesn't steal it back
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    setLatex(node.attrs.latex);
  }, [node.attrs.latex]);

  const save = useCallback(() => {
    updateAttributes({ latex });
    setEditing(false);
  }, [latex, updateAttributes]);

  // Exit: save and move the caret to `pos` in the outer editor so the
  // cursor doesn't vanish when leaving the block via keyboard. `after:
  // true` places the caret right after the node; false places it right
  // before.
  const exit = useCallback(
    (after: boolean) => {
      updateAttributes({ latex });
      setEditing(false);
      if (typeof getPos === "function" && editor) {
        const base = getPos();
        const pos = after ? base + node.nodeSize : base;
        requestAnimationFrame(() => {
          editor.chain().focus().setTextSelection(pos).run();
        });
      }
    },
    [latex, updateAttributes, editor, getPos, node],
  );

  if (editing) {
    return (
      <NodeViewWrapper className="math-block-wrapper editing">
        <div className="math-block-editor">
          <textarea
            ref={textareaRef}
            className="math-block-input"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              const ta = e.currentTarget;
              const atStart =
                ta.selectionStart === 0 && ta.selectionEnd === 0;
              const atEnd =
                ta.selectionStart === ta.value.length &&
                ta.selectionEnd === ta.value.length;
              // "First/last line" = no newline between the caret and the
              // start/end of the textarea value. Lets Up on the first line
              // (and Down on the last line) exit the block even when the
              // caret isn't exactly at position 0 / value.length.
              const beforeCaret = ta.value.slice(0, ta.selectionStart);
              const afterCaret = ta.value.slice(ta.selectionEnd);
              const onFirstLine = !beforeCaret.includes("\n");
              const onLastLine = !afterCaret.includes("\n");
              if (e.key === "Escape") {
                e.preventDefault();
                exit(true);
              } else if (
                (e.key === "ArrowLeft" && atStart) ||
                (e.key === "ArrowUp" && onFirstLine)
              ) {
                e.preventDefault();
                exit(false);
              } else if (
                (e.key === "ArrowRight" && atEnd) ||
                (e.key === "ArrowDown" && onLastLine)
              ) {
                e.preventDefault();
                exit(true);
              }
            }}
            placeholder="Enter LaTeX (e.g. \\sum_{i=1}^n x_i)"
            rows={3}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  let rendered: string;
  try {
    rendered = katex.renderToString(latex || "\\text{Empty math block}", {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    rendered = `<span class="math-error">${latex}</span>`;
  }

  return (
    <NodeViewWrapper
      className={`math-block-wrapper${selected ? " selected" : ""}`}
    >
      <div
        className="math-block-rendered"
        onClick={() => setEditing(true)}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-latex") || el.textContent || "",
        renderHTML: (attrs: Record<string, any>) => ({
          "data-latex": attrs.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mathBlock"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "mathBlock" }, HTMLAttributes),
      node.attrs.latex,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});
