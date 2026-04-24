import React, { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Module-level cache: first block to render pays the dynamic-import cost,
// all subsequent blocks reuse the resolved module.
let mermaidModule: any = null;
let mermaidLoadPromise: Promise<any> | null = null;

function detectTheme(): string {
  const body = document.body;
  if (
    body.classList.contains("vscode-dark") ||
    body.classList.contains("vscode-high-contrast")
  ) {
    return "dark";
  }
  return "default";
}

async function getMermaid(): Promise<any> {
  if (mermaidModule) return mermaidModule;
  if (!mermaidLoadPromise) {
    mermaidLoadPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: detectTheme(),
      });
      mermaidModule = mermaid;
      return mermaid;
    });
  }
  return mermaidLoadPromise;
}

function MermaidBlockView({ node }: any) {
  const source = node.textContent as string;
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  // Source collapse is ephemeral UI state (not persisted to markdown).
  // Default: expanded when the block is empty or erroring (so users can
  // fix it), collapsed once there's a successful render.
  const [sourceOpen, setSourceOpen] = useState<boolean>(true);
  // Stable, unique id for mermaid.render — must start with a letter so it
  // can be used as a DOM id / SVG target.
  const idRef = useRef<string>(
    `mermaid-${Math.random().toString(36).slice(2, 10)}`
  );

  useEffect(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      setSvg("");
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Debounce renders so we don't thrash mermaid on every keystroke.
    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        const result = await mermaid.render(idRef.current, trimmed);
        if (cancelled) return;
        setSvg(result.svg);
        setError("");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : String(e));
        setSvg("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source]);

  return (
    <NodeViewWrapper className="mermaid-block-wrapper">
      <div className="mermaid-block-toolbar" contentEditable={false}>
        <button
          type="button"
          className="mermaid-block-toggle"
          onClick={() => setSourceOpen((v) => !v)}
          title={sourceOpen ? "Hide source" : "Show source"}
          aria-label={sourceOpen ? "Hide source" : "Show source"}
          aria-expanded={sourceOpen}
        >
          {sourceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>source</span>
        </button>
      </div>
      {/* Keep <pre> in the DOM even when collapsed so ProseMirror's content
          hole is always mounted; hide it with a class instead. */}
      <pre
        className={`mermaid-block-source${sourceOpen ? "" : " collapsed"}`}
      >
        <NodeViewContent as="code" className="language-mermaid" />
      </pre>
      <div className="mermaid-block-preview" contentEditable={false}>
        {!source.trim() ? (
          <div className="mermaid-block-empty">
            Enter mermaid syntax above (e.g. graph TD; A--&gt;B)
          </div>
        ) : error ? (
          <div className="mermaid-block-error">{error}</div>
        ) : svg ? (
          <div
            className="mermaid-block-rendered"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : loading ? (
          <div className="mermaid-block-loading">Rendering…</div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  // Higher than CodeBlockLowlight's default (100) so the parseHTML rule below
  // gets first crack at <pre> blocks and can claim the mermaid ones.
  priority: 1000,

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (el: any) => {
          if (!(el instanceof HTMLElement)) return false;
          const code = el.querySelector("code");
          if (!code) return false;
          return code.classList.contains("language-mermaid") ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      ["code", mergeAttributes(HTMLAttributes, { class: "language-mermaid" }), 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView);
  },
});
