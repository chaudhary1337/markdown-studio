import React, { useEffect, useRef, useCallback } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { StickyHeadings } from "./components/StickyHeadings";
import { markdownToBlocks, blocksToMarkdown } from "./hooks/useVSCodeSync";

const vscodeApi = acquireVsCodeApi();

export function App() {
  const editor = useCreateBlockNote();
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = React.useState<string | null>("Loading document...");

  // On mount: request content from host, load it into editor
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "init" && !initialized.current) {
        initialized.current = true;
        if (msg.baseUri) baseUri.current = msg.baseUri;
        if (msg.docFolderPath) docFolderPath.current = msg.docFolderPath;
        const md = (msg.content as string) || "";
        if (md.trim()) {
          setStatus("Parsing markdown...");
          try {
            const blocks = await markdownToBlocks(editor, md, baseUri.current);
            if (blocks.length > 0) {
              editor.replaceBlocks(editor.document, blocks);
            }
          } catch (err: any) {
            setStatus(`Parse error: ${err?.message || err}`);
          }
        }
        setStatus(null);
      } else if (msg.type === "update" && initialized.current) {
        try {
          const blocks = await markdownToBlocks(editor, msg.content, baseUri.current);
          editor.replaceBlocks(editor.document, blocks);
        } catch {
          // Ignore parse failures on external updates
        }
      }
    };
    window.addEventListener("message", handler);
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  // Link handling: Cmd+click, Ctrl+click, middle-click, or toolbar "open" button
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;

      // Always prevent default navigation in webview
      e.preventDefault();
      e.stopPropagation();

      // Cmd+click, Ctrl+click, middle mouse, or any external link click
      if (e.metaKey || e.ctrlKey || e.button === 1) {
        vscodeApi.postMessage({ type: "openLink", href });
      }
    };

    // Intercept BlockNote's "open in new tab" toolbar button
    // BlockNote resolves URLs against window.location.href (vscode-webview://...),
    // producing invalid paths. We strip the webview prefix to recover the original href.
    const originalOpen = window.open;
    window.open = (url?: string | URL, ...args: any[]) => {
      if (url) {
        let href = String(url);
        // Strip vscode-webview://id/ prefix if present
        href = href.replace(/^vscode-webview:\/\/[^/]+\//, "");
        // If it collapsed to just "#", ignore
        if (href && href !== "#") {
          vscodeApi.postMessage({ type: "openLink", href });
        }
      }
      return null;
    };

    document.addEventListener("click", clickHandler, true);
    document.addEventListener("auxclick", clickHandler, true);
    return () => {
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("auxclick", clickHandler, true);
      window.open = originalOpen;
    };
  }, []);

  // Sync: editor changes -> extension host
  const handleChange = useCallback(() => {
    if (!initialized.current) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const markdown = await blocksToMarkdown(editor, baseUri.current, docFolderPath.current);
        vscodeApi.postMessage({ type: "edit", content: markdown });
        setStatus(null);
      } catch (err: any) {
        const msg = err?.message || String(err);
        setStatus(`Save error: ${msg}`);
        console.error("blocksToMarkdown failed:", err);
      }
    }, 300);
  }, [editor]);

  const switchToSource = () => {
    vscodeApi.postMessage({ type: "toggleEditor" });
  };

  return (
    <div className="editor-container">
      {status && <div className="status-bar">{status}</div>}
      <StickyHeadings editor={editor} />
      <span
        className="toggle-source"
        onClick={switchToSource}
        role="button"
        tabIndex={0}
      >
        Open in Default Editor
      </span>
      <BlockNoteView editor={editor} onChange={handleChange} theme="dark" />
    </div>
  );
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
