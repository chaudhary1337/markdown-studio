import React, { useEffect, useRef, useCallback } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { StickyHeadings } from "./components/StickyHeadings";

const vscodeApi = acquireVsCodeApi();

export function App() {
  const editor = useCreateBlockNote();
  const initialized = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: request content from host, load it into editor
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "init" && !initialized.current) {
        initialized.current = true;
        const md = msg.content as string;
        if (md.trim()) {
          try {
            const blocks = await editor.tryParseMarkdownToBlocks(md);
            if (blocks.length > 0) {
              editor.replaceBlocks(editor.document, blocks);
            }
          } catch {
            // If parsing fails, leave editor empty
          }
        }
      } else if (msg.type === "update" && initialized.current) {
        // External change (git, another editor)
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(msg.content);
          editor.replaceBlocks(editor.document, blocks);
        } catch {
          // Ignore parse failures
        }
      }
    };
    window.addEventListener("message", handler);
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  // Sync: editor changes → extension host
  const handleChange = useCallback(() => {
    if (!initialized.current) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      vscodeApi.postMessage({ type: "edit", content: markdown });
    }, 300);
  }, [editor]);

  return (
    <div className="editor-container">
      <StickyHeadings editor={editor} />
      <BlockNoteView editor={editor} onChange={handleChange} theme="dark" />
    </div>
  );
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
