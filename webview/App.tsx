import React, { useEffect, useRef, useCallback } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { StickyHeadings } from "./components/StickyHeadings";
import { TableOfContents } from "./components/TableOfContents";
import { SearchBar } from "./components/SearchBar";
import { markdownToBlocks, blocksToMarkdown } from "./hooks/useVSCodeSync";
import { extractMeta, buildMeta, appendMeta, restoreHeadings, mergeMetadata, type Metadata } from "./metadata";

const vscodeApi = acquireVsCodeApi();

export function App() {
  const editor = useCreateBlockNote();
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const metaRef = useRef<Metadata>({ h: [] });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = React.useState<string | null>("Loading document...");
  const [searchVisible, setSearchVisible] = React.useState(false);

  // On mount: request content from host, load it into editor
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "init" && !initialized.current) {
        initialized.current = true;
        if (msg.baseUri) baseUri.current = msg.baseUri;
        if (msg.docFolderPath) docFolderPath.current = msg.docFolderPath;
        const rawMd = (msg.content as string) || "";
        if (rawMd.trim()) {
          setStatus("Parsing markdown...");
          try {
            // Extract existing meta block, then scan raw markdown for h4-h6
            const { content, meta: existingMeta } = extractMeta(rawMd);
            const scannedMeta = buildMeta(content);
            // Merge: scanned headings take priority (they reflect current file state)
            // Existing meta fills in anything not found in the scan
            metaRef.current = mergeMetadata(scannedMeta, existingMeta);

            const blocks = await markdownToBlocks(editor, content, baseUri.current);
            if (blocks.length > 0) {
              editor.replaceBlocks(editor.document, blocks);
            }
          } catch (err: any) {
            setStatus(`Parse error: ${err?.message || err}`);
          }
        }
        setStatus(null);
      } else if (msg.type === "openSearch") {
        setSearchVisible(true);
      } else if (msg.type === "update" && initialized.current) {
        try {
          const { content, meta: existingMeta } = extractMeta(msg.content);
          const scannedMeta = buildMeta(content);
          metaRef.current = mergeMetadata(scannedMeta, existingMeta);

          const blocks = await markdownToBlocks(editor, content, baseUri.current);
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

  // Ctrl+F / Cmd+F: open search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchVisible(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Link handling: Cmd+click, Ctrl+click, middle-click, or toolbar "open" button
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.metaKey || e.ctrlKey || e.button === 1) {
        vscodeApi.postMessage({ type: "openLink", href });
      }
    };

    const originalOpen = window.open;
    window.open = (url?: string | URL, ...args: any[]) => {
      if (url) {
        let href = String(url);
        href = href.replace(/^vscode-webview:\/\/[^/]+\//, "");
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
        let markdown = await blocksToMarkdown(editor, baseUri.current, docFolderPath.current);
        // Restore h4-h6 from metadata, then append meta block
        markdown = restoreHeadings(markdown, metaRef.current);
        markdown = appendMeta(markdown, metaRef.current);
        vscodeApi.postMessage({ type: "edit", content: markdown });
        setStatus(null);
      } catch (err: any) {
        const msg = err?.message || String(err);
        setStatus(`Save error: ${msg}`);
        console.error("[better-markdown] blocksToMarkdown failed:", err);
      }
    }, 300);
  }, [editor]);

  const switchToSource = () => {
    vscodeApi.postMessage({ type: "toggleEditor" });
  };

  return (
    <div className="editor-layout">
      <div className="editor-container">
        <SearchBar visible={searchVisible} onClose={() => setSearchVisible(false)} />
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
      <div className="toc-wrapper">
        <TableOfContents editor={editor} />
      </div>
    </div>
  );
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
