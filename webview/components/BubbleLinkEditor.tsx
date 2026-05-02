import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, Unlink, X } from "lucide-react";

interface Props {
  editor: Editor;
  onClose: () => void;
}

/** Inline URL editor that swaps in for the bubble menu's button row when
 *  the user activates the Link button. Manages its own URL state and
 *  applies / removes the link mark on the editor's current selection. */
export function BubbleLinkEditor({ editor, onClose }: Props) {
  const [url, setUrl] = useState(
    () => (editor.getAttributes("link").href as string | undefined) ?? "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLink = editor.isActive("link");

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const apply = () => {
    const trimmed = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (trimmed === "") chain.unsetLink().run();
    else chain.setLink({ href: trimmed }).run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <div className="bubble-link-row">
      <button
        type="button"
        className="bubble-btn"
        onClick={onClose}
        title="Cancel (Esc)"
      >
        <X size={14} />
      </button>
      <input
        ref={inputRef}
        type="text"
        className="bubble-link-input"
        value={url}
        placeholder="Paste or type a URL"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button
        type="button"
        className="bubble-btn"
        onClick={apply}
        title="Apply (Enter)"
        disabled={url.trim() === "" && !hasLink}
      >
        <Check size={14} />
      </button>
      {hasLink && (
        <button
          type="button"
          className="bubble-btn"
          onClick={remove}
          title="Remove link"
        >
          <Unlink size={14} />
        </button>
      )}
    </div>
  );
}
