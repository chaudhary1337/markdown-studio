import React, { useState, useEffect, useRef, useCallback } from "react";
import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

function ImageNodeView({ node, updateAttributes, selected }: any) {
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(node.attrs.alt || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCaption(node.attrs.alt || "");
  }, [node.attrs.alt]);

  useEffect(() => {
    setError(false);
  }, [node.attrs.src]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  const saveCaption = useCallback(() => {
    updateAttributes({ alt: caption });
    setEditing(false);
  }, [caption, updateAttributes]);

  return (
    <NodeViewWrapper
      className={"image-block" + (selected ? " selected" : "")}
      data-drag-handle=""
    >
      <figure>
        {error ? (
          <div className="image-placeholder">
            <span className="image-placeholder-icon">&#128247;</span>
            <span>Image not found</span>
            <span className="image-placeholder-path">
              {node.attrs.src?.split("/").pop() || "unknown"}
            </span>
          </div>
        ) : (
          <img
            src={node.attrs.src}
            alt={node.attrs.alt || ""}
            title={node.attrs.title || undefined}
            onError={() => setError(true)}
            draggable={false}
          />
        )}
        <figcaption onClick={() => setEditing(true)}>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              className="image-caption-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={saveCaption}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  saveCaption();
                }
              }}
              placeholder=""
            />
          ) : (
            <span className="image-caption-text">
              {node.attrs.alt || ""}
            </span>
          )}
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}

export const ImageBlock = Image.extend({
  // Force block-level so images aren't inline
  inline: false,
  group: "block",

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
