import React, { useState, useEffect, useRef, useCallback } from "react";
import { Node, InputRule, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import katex from "katex";

function MathInlineView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: any) {
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

  // Exit: save and move the caret to `pos` in the outer editor so the
  // cursor doesn't vanish when dismissing the inline math via keyboard.
  // `after: true` places the caret right after the node; false places it
  // right before.
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
      <NodeViewWrapper as="span" className="math-inline-wrapper editing">
        <input
          ref={inputRef}
          className="math-inline-input"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            const input = e.currentTarget;
            const atStart =
              input.selectionStart === 0 && input.selectionEnd === 0;
            const atEnd =
              input.selectionStart === input.value.length &&
              input.selectionEnd === input.value.length;
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              exit(true);
            } else if (
              (e.key === "ArrowLeft" && atStart) ||
              e.key === "ArrowUp"
            ) {
              e.preventDefault();
              exit(false);
            } else if (
              (e.key === "ArrowRight" && atEnd) ||
              e.key === "ArrowDown"
            ) {
              e.preventDefault();
              exit(true);
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

  addInputRules() {
    // `$content$` → inline math node. Require non-space at both ends so that
    // currency phrasings like "$5 to $10" don't collapse into math, and use a
    // negative lookbehind on `$` so `$$x$$` block math isn't half-matched.
    return [
      new InputRule({
        find: /(?<!\$)\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          if (!latex) return null;
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex }),
          );
        },
      }),
    ];
  },
});
