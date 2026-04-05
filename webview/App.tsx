import React, { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { SlashCommand } from "./extensions/SlashCommand";
import { StickyHeadings } from "./components/StickyHeadings";
import { TableOfContents } from "./components/TableOfContents";
import { SearchBar } from "./components/SearchBar";
import { markdownToHtml, htmlToMarkdown } from "./hooks/useVSCodeSync";
import {
  extractMeta,
  buildMeta,
  appendMeta,
  restoreHeadings,
  mergeMetadata,
  type Metadata,
} from "./metadata";

const vscodeApi = acquireVsCodeApi();
const lowlight = createLowlight(common);

export function App() {
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const metaRef = useRef<Metadata>({ h: [] });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadonly = useRef(false);
  const [status, setStatus] = React.useState<string | null>(
    "Loading document...",
  );
  const [readonly, setReadonly] = React.useState(false);
  const [searchVisible, setSearchVisible] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      SlashCommand,
    ],
    editorProps: {
      attributes: { class: "tiptap-editor" },
    },
  });

  // Propagate readonly state to the Tiptap editor
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readonly);
  }, [editor, readonly]);

  // On mount: request content from host, load into editor
  useEffect(() => {
    if (!editor) return;

    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "init" && !initialized.current) {
        initialized.current = true;
        if (msg.baseUri) baseUri.current = msg.baseUri;
        if (msg.docFolderPath) docFolderPath.current = msg.docFolderPath;
        if (msg.isReadonly) {
          isReadonly.current = true;
          setReadonly(true);
        }
        const rawMd = (msg.content as string) || "";
        if (rawMd.trim()) {
          setStatus("Parsing markdown...");
          try {
            const { content, meta: existingMeta } = extractMeta(rawMd);
            const scannedMeta = buildMeta(content);
            metaRef.current = mergeMetadata(scannedMeta, existingMeta);
            const html = await markdownToHtml(content, baseUri.current);
            editor.commands.setContent(html);
          } catch (err: any) {
            setStatus(`Parse error: ${err?.message || err}`);
          }
        }
        setStatus(null);
      } else if (msg.type === "update" && initialized.current) {
        try {
          const { content, meta: existingMeta } = extractMeta(msg.content);
          const scannedMeta = buildMeta(content);
          metaRef.current = mergeMetadata(scannedMeta, existingMeta);
          const html = await markdownToHtml(content, baseUri.current);
          editor.commands.setContent(html);
        } catch {
          // Ignore parse failures on external updates
        }
      } else if (msg.type === "openSearch") {
        setSearchVisible(true);
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

  // Link handling: Cmd+click / Ctrl+click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
    document.addEventListener("click", handler, true);
    document.addEventListener("auxclick", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("auxclick", handler, true);
    };
  }, []);

  // Sync: editor changes → extension host
  const handleUpdate = useCallback(() => {
    if (!initialized.current || !editor) return;
    if (isReadonly.current) return; // never write back for git: and friends
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const html = editor.getHTML();
        let markdown = await htmlToMarkdown(
          html,
          baseUri.current,
          docFolderPath.current,
        );
        markdown = restoreHeadings(markdown, metaRef.current);
        markdown = appendMeta(markdown, metaRef.current);
        vscodeApi.postMessage({ type: "edit", content: markdown });
        setStatus(null);
      } catch (err: any) {
        setStatus(`Save error: ${err?.message || String(err)}`);
        console.error("[better-markdown] htmlToMarkdown failed:", err);
      }
    }, 300);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, handleUpdate]);

  const switchToSource = () => {
    vscodeApi.postMessage({ type: "toggleEditor" });
  };

  if (!editor) return null;

  return (
    <div className="editor-layout">
      <div className="editor-container">
        <SearchBar
          visible={searchVisible}
          onClose={() => setSearchVisible(false)}
        />
        {status && <div className="status-bar">{status}</div>}
        {readonly && <div className="readonly-badge">Read-only</div>}
        <StickyHeadings />
        <span
          className="toggle-source"
          onClick={switchToSource}
          role="button"
          tabIndex={0}
        >
          Open in Default Editor
        </span>
        <EditorContent editor={editor} />
      </div>
      <div className="toc-wrapper">
        <TableOfContents />
      </div>
    </div>
  );
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
