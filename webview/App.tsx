import React, { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { ImageBlock } from "./extensions/ImageView";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";
import { createCodeBlock } from "./extensions/CodeBlockView";
import { SlashCommand } from "./extensions/SlashCommand";
import { MathInline } from "./extensions/MathInline";
import { MathBlock } from "./extensions/MathBlock";
import { StickyHeadings } from "./components/StickyHeadings";
import { TableOfContents } from "./components/TableOfContents";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { DiffView } from "./components/DiffView";
import { TableControls } from "./components/TableControls";
import { ImageInsertDialog } from "./components/ImageInsertDialog";
import { DOMSerializer } from "@tiptap/pm/model";
import { markdownToHtml, htmlToMarkdown, htmlToMarkdownSync } from "./hooks/useVSCodeSync";
import { extractFrontmatter, prependFrontmatter } from "./frontmatter";
import { DEFAULT_SETTINGS, mergeSettings, type BetterMarkdownSettings } from "./settings";
import { vscodeApi, isBrowserMode } from "./vscode-api";

const lowlight = createLowlight(common);

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return map[mime] || ".png";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function App() {
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const filePath = useRef("");
  const frontmatterRef = useRef("");
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
  const [imageDialogVisible, setImageDialogVisible] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const handleUpdateRef = useRef<() => void>(() => {});
  const editorContainerRef = useRef<HTMLDivElement>(null);

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

  // Upload an image file and return the full src URL for the editor
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const name =
      file.name && file.name !== "image.png" && file.name !== "blob"
        ? file.name
        : `pasted-${Date.now()}${mimeToExt(file.type)}`;

    if (isBrowserMode) {
      const match = baseUri.current.match(/\/doc\/([^/]+)$/);
      if (!match) throw new Error("Cannot determine upload target");
      const resp = await fetch(
        `/upload/${match[1]}/${encodeURIComponent(name)}`,
        { method: "POST", body: file },
      );
      if (!resp.ok) throw new Error("Upload failed");
      const data = await resp.json();
      return `${baseUri.current}/${data.filename}`;
    }
    // VS Code mode: send base64 via postMessage
    const base64 = await fileToBase64(file);
    return new Promise<string>((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        if (ev.data?.type === "imageUploaded") {
          window.removeEventListener("message", handler);
          if (ev.data.src) resolve(ev.data.src as string);
          else reject(new Error("Upload failed"));
        }
      };
      window.addEventListener("message", handler);
      vscodeApi.postMessage({ type: "uploadImage", data: base64, filename: name });
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Link.configure({ openOnClick: false }),
      ImageBlock,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      createCodeBlock(lowlight),
      MathInline,
      MathBlock,
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
        if (msg.filePath) filePath.current = msg.filePath;
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
            const { content: noFm, frontmatter } = extractFrontmatter(rawMd);
            frontmatterRef.current = frontmatter;
            const html = await markdownToHtml(noFm, baseUri.current);
            editor.commands.setContent(html);
          } catch (err: any) {
            setStatus(`Parse error: ${err?.message || err}`);
          }
        }
        setStatus(null);
      } else if (msg.type === "update" && initialized.current) {
        try {
          const { content: noFm, frontmatter } = extractFrontmatter(msg.content);
          frontmatterRef.current = frontmatter;
          const html = await markdownToHtml(noFm, baseUri.current);
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
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault(); // prevent browser "Save HTML" dialog
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
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

  // Slash command "Image" opens the dialog
  useEffect(() => {
    const handler = () => setImageDialogVisible(true);
    window.addEventListener("btrmk:showImageDialog", handler);
    return () => window.removeEventListener("btrmk:showImageDialog", handler);
  }, []);

  // Drag-and-drop images into editor
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const dragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const dragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    const dragLeave = (e: DragEvent) => {
      // Only reset when leaving the container (not entering a child)
      if (!container.contains(e.relatedTarget as Node)) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();

      const coords = editor.view.posAtCoords({
        left: e.clientX,
        top: e.clientY,
      });

      files.forEach(async (file) => {
        try {
          const src = await uploadImage(file);
          const pos = coords?.pos ?? editor.state.selection.from;
          editor.chain().insertContentAt(pos, { type: "image", attrs: { src } }).run();
        } catch (err) {
          console.error("[better-markdown] image drop failed:", err);
        }
      });
    };

    container.addEventListener("dragenter", dragEnter);
    container.addEventListener("dragover", dragOver);
    container.addEventListener("dragleave", dragLeave);
    container.addEventListener("drop", drop);
    return () => {
      container.removeEventListener("dragenter", dragEnter);
      container.removeEventListener("dragover", dragOver);
      container.removeEventListener("dragleave", dragLeave);
      container.removeEventListener("drop", drop);
    };
  }, [editor, uploadImage]);

  // Paste images from clipboard
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    const pasteHandler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItems = items.filter((i) => i.type.startsWith("image/"));
      if (!imageItems.length) return;

      e.preventDefault();
      imageItems.forEach(async (item) => {
        const file = item.getAsFile();
        if (!file) return;
        try {
          const src = await uploadImage(file);
          editor.chain().focus().setImage({ src }).run();
        } catch (err) {
          console.error("[better-markdown] image paste failed:", err);
        }
      });
    };

    dom.addEventListener("paste", pasteHandler);
    return () => dom.removeEventListener("paste", pasteHandler);
  }, [editor, uploadImage]);

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
        markdown = prependFrontmatter(markdown, frontmatterRef.current);
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

  const openInBrowser = () => {
    vscodeApi.postMessage({ type: "openInBrowser" });
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
      <div className={"editor-container" + (dragOver ? " drag-over" : "")} ref={editorContainerRef}>
        <SearchBar
          visible={searchVisible}
          onClose={(activeRange) => {
            setSearchVisible(false);
            if (activeRange && editor) {
              try {
                const pos = editor.view.posAtDOM(
                  activeRange.startContainer,
                  activeRange.startOffset,
                );
                editor.commands.focus();
                editor.commands.setTextSelection(pos);
              } catch {
                editor.commands.focus();
              }
            }
          }}
        />
        {status && <div className="status-bar">{status}</div>}
        <div className="editor-toolbar">
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
          >
            ⚙
          </button>
        </div>
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
        <div className="toggle-source-row">
          <span
            className="toggle-source"
            onClick={switchToSource}
            role="button"
            tabIndex={0}
          >
            {isBrowserMode ? "Open in VS Code" : "Open in Default Editor"}
          </span>
          {!isBrowserMode && (
            <span
              className="toggle-source"
              onClick={openInBrowser}
              role="button"
              tabIndex={0}
            >
              Open in Browser
            </span>
          )}
        </div>
        <EditorContent editor={editor} />
        <TableControls editor={editor} containerRef={editorContainerRef} />
      </div>
      <div className="toc-wrapper">
        <TableOfContents />
      </div>
      <ImageInsertDialog
        visible={imageDialogVisible}
        onClose={() => setImageDialogVisible(false)}
        onUploadFile={uploadImage}
        onInsert={(src) => {
          setImageDialogVisible(false);
          editor?.chain().focus().setImage({ src }).run();
        }}
      />
    </div>
  );
}

