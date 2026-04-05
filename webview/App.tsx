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
import { SettingsPanel } from "./components/SettingsPanel";
import { DiffView } from "./components/DiffView";
import { DOMSerializer } from "@tiptap/pm/model";
import { markdownToHtml, htmlToMarkdown, htmlToMarkdownSync } from "./hooks/useVSCodeSync";
import {
  extractMeta,
  buildMeta,
  appendMeta,
  restoreHeadings,
  mergeMetadata,
  type Metadata,
} from "./metadata";
import { DEFAULT_SETTINGS, mergeSettings, type BetterMarkdownSettings } from "./settings";
import { vscodeApi } from "./vscode-api";

const lowlight = createLowlight(common);

export function App() {
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const metaRef = useRef<Metadata>({ h: [] });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadonly = useRef(false);
  const settingsRef = useRef<BetterMarkdownSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = React.useState<string | null>(
    "Loading document...",
  );
  const [readonly, setReadonly] = React.useState(false);
  const [searchVisible, setSearchVisible] = React.useState(false);
  const [settings, setSettings] = React.useState<BetterMarkdownSettings>(DEFAULT_SETTINGS);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [diffVisible, setDiffVisible] = React.useState(false);
  const [diffData, setDiffData] = React.useState<{
    headContent: string;
    fileName: string;
  } | null>(null);
  const handleUpdateRef = useRef<() => void>(() => {});

  // Keep the ref in sync with state — the save pipeline runs on a
  // debounced timer and reads the ref so it always sees the latest value.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateSettings = useCallback((next: BetterMarkdownSettings) => {
    settingsRef.current = next; // set synchronously so next save sees it
    setSettings(next);
    vscodeApi.postMessage({ type: "saveSettings", settings: next });
    // Re-serialize the document with the new settings immediately
    handleUpdateRef.current();
  }, []);

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
        if (msg.settings) {
          const merged = mergeSettings(msg.settings);
          settingsRef.current = merged;
          setSettings(merged);
        }
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
      } else if (msg.type === "settingsUpdated") {
        const merged = mergeSettings(msg.settings);
        settingsRef.current = merged;
        setSettings(merged);
      } else if (msg.type === "gitDiffResponse") {
        if (typeof msg.headContent !== "string") {
          setStatus("Not tracked by git — nothing to diff against HEAD.");
          setTimeout(() => setStatus(null), 3000);
          setDiffVisible(false);
          return;
        }
        setDiffData({ headContent: msg.headContent, fileName: msg.fileName });
      }
    };
    window.addEventListener("message", handler);
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  // Ctrl+F / Cmd+F: open search bar. Escape: close settings.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchVisible(true);
      } else if (e.key === "Escape") {
        setSettingsVisible(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Copy/cut: serialize the selection to markdown so text editors (and
  // git commits, slack, etc.) receive .md source instead of rendered text.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    const handler = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) return;

      const slice = editor.state.doc.slice(from, to);
      const serializer = DOMSerializer.fromSchema(editor.schema);
      const fragment = serializer.serializeFragment(slice.content);
      const tmp = document.createElement("div");
      tmp.appendChild(fragment);
      const html = tmp.innerHTML;

      let markdown: string;
      try {
        markdown = htmlToMarkdownSync(
          html,
          baseUri.current,
          docFolderPath.current,
          settingsRef.current,
        );
      } catch (err) {
        console.error("[better-markdown] copy → markdown failed:", err);
        return; // let Tiptap's default behavior run
      }

      e.preventDefault();
      e.clipboardData.setData("text/plain", markdown.replace(/\n+$/, ""));
      e.clipboardData.setData("text/html", html);

      // For cut, also delete the selection (we preventDefault'd the copy,
      // and the browser's cut would have removed it automatically — we must
      // do that manually now).
      if (e.type === "cut" && editor.isEditable) {
        editor.commands.deleteSelection();
      }
    };

    dom.addEventListener("copy", handler);
    dom.addEventListener("cut", handler);
    return () => {
      dom.removeEventListener("copy", handler);
      dom.removeEventListener("cut", handler);
    };
  }, [editor]);

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
          settingsRef.current,
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
    handleUpdateRef.current = handleUpdate;
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, handleUpdate]);

  const switchToSource = () => {
    vscodeApi.postMessage({ type: "toggleEditor" });
  };

  const toggleDiff = () => {
    if (diffVisible) {
      setDiffVisible(false);
      return;
    }
    setDiffVisible(true);
    vscodeApi.postMessage({ type: "requestGitDiff" });
  };

  // Current editor content as markdown (for the diff "new" side)
  const currentMarkdown = React.useMemo(() => {
    if (!editor || !diffVisible) return "";
    try {
      const html = editor.getHTML();
      // Synchronous converter for diff display. We tolerate a slightly
      // stale snapshot vs the on-disk file — the user can re-toggle.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return htmlToMarkdownSync(
        html,
        baseUri.current,
        docFolderPath.current,
        settingsRef.current,
      );
    } catch {
      return "";
    }
  }, [editor, diffVisible, diffData]);

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
        {!readonly && (
          <button
            className={"diff-button" + (diffVisible ? " active" : "")}
            onClick={toggleDiff}
            title="Diff against HEAD"
            aria-label="Toggle git diff view"
          >
            Diff
          </button>
        )}
        <button
          className="settings-button"
          onClick={() => setSettingsVisible(true)}
          title="Markdown settings"
          aria-label="Open markdown settings"
          style={readonly ? { right: 96 } : undefined}
        >
          ⚙
        </button>
        <SettingsPanel
          visible={settingsVisible}
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsVisible(false)}
        />
        {diffVisible && diffData && (
          <DiffView
            oldContent={diffData.headContent}
            newContent={currentMarkdown}
            fileName={diffData.fileName}
            layout={settings.diffLayout}
            mode={settings.diffMode}
            onClose={() => setDiffVisible(false)}
            onLayoutChange={(layout) =>
              updateSettings({ ...settings, diffLayout: layout })
            }
            onModeChange={(diffMode) =>
              updateSettings({ ...settings, diffMode })
            }
          />
        )}
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

