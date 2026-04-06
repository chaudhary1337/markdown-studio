import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";

const LANGUAGES = [
  "plaintext",
  "arduino", "bash", "c", "cpp", "csharp", "css", "diff",
  "go", "graphql", "ini", "java", "javascript", "json",
  "kotlin", "less", "lua", "makefile", "markdown",
  "objectivec", "perl", "php", "python", "r", "ruby",
  "rust", "scss", "shell", "sql", "swift", "typescript",
  "vbnet", "wasm", "xml", "yaml",
];

function CodeBlockComponent({ node, updateAttributes, extension }: any) {
  const language = node.attrs.language || "";
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const filtered = filter
    ? LANGUAGES.filter((l) => l.includes(filter.toLowerCase()))
    : LANGUAGES;

  const select = useCallback((lang: string) => {
    updateAttributes({ language: lang === "plaintext" ? "" : lang });
    setOpen(false);
    setFilter("");
  }, [updateAttributes]);

  // Position dropdown and focus input when it opens
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on scroll outside the dropdown so it doesn't float detached
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setFilter("");
    };
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  return (
    <NodeViewWrapper as="pre" className="code-block-wrapper">
      <div className="code-block-lang-bar" contentEditable={false}>
        <button
          ref={buttonRef}
          className="code-block-lang-button"
          onClick={() => setOpen(!open)}
          type="button"
        >
          {language || "plaintext"}
        </button>
        {open && pos && createPortal(
          <div
            className="code-block-lang-dropdown"
            ref={dropdownRef}
            style={{ top: pos.top, left: pos.left }}
          >
            <input
              ref={inputRef}
              className="code-block-lang-search"
              type="text"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setFilter("");
                } else if (e.key === "Enter" && filtered.length > 0) {
                  select(filtered[0]);
                }
              }}
            />
            <div className="code-block-lang-list">
              {filtered.map((lang) => (
                <div
                  key={lang}
                  className={
                    "code-block-lang-option" +
                    ((lang === language || (lang === "plaintext" && !language)) ? " active" : "")
                  }
                  onClick={() => select(lang)}
                >
                  {lang}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="code-block-lang-empty">No match</div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
      <NodeViewContent as="code" className={language ? `language-${language} hljs` : ""} />
    </NodeViewWrapper>
  );
}

export function createCodeBlock(lowlight: any) {
  return CodeBlockLowlight.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockComponent);
    },
  }).configure({ lowlight });
}
