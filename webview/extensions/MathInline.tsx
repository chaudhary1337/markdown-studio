import React, { useState, useEffect, useRef, useCallback } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import katex from "katex";

function MathInlineView({ node, updateAttributes, selected }: any) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [latex, setLatex] = useState(node.attrs.latex);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enter editing mode when the node is selected (click or arrow-key nav)
  useEffect(() => {
    if (selected && !editing) setEditing(true);
  }, [selected]);

  useEffect(() => {
    if (editing && inputRef.current) {
      // Delay focus so ProseMirror doesn't steal it back
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    setLatex(node.attrs.latex);
  }, [node.attrs.latex]);

  const save = useCallback(() => {
    updateAttributes({ latex });
    setEditing(false);
  }, [latex, updateAttributes]);

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="math-inline-wrapper editing">
        <input
          ref={inputRef}
          className="math-inline-input"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="E=mc^2"
          size={Math.max(latex.length + 2, 6)}
        />
      </NodeViewWrapper>
    );
  }

  let rendered: string;
  try {
    rendered = katex.renderToString(latex || "?", {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    rendered = `<span class="math-error">${latex}</span>`;
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`math-inline-wrapper${selected ? " selected" : ""}`}
    >
      <span
        className="math-inline-rendered"
        onClick={() => setEditing(true)}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
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
    return [{ tag: 'span[data-type="mathInline"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "mathInline" }, HTMLAttributes),
      node.attrs.latex,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },
});
