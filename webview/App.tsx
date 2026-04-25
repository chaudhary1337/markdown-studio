import React, { useEffect, useRef } from "react";
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
import { MermaidBlock } from "./extensions/MermaidBlock";
import { YouTubeEmbed } from "./extensions/YouTubeEmbed";
import { GitHubEmbed } from "./extensions/GitHubEmbed";
import { StickyHeadings } from "./components/StickyHeadings";
import { TableOfContents } from "./components/TableOfContents";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { DiffView } from "./components/DiffView";
import { TableControls } from "./components/TableControls";
import { ImageInsertDialog } from "./components/ImageInsertDialog";
import { useSettingsPanel } from "./hooks/useSettingsPanel";
import { resolveEditorSurface } from "./utils";
import { useEditorState } from "./hooks/useEditorState";
import { useClipboardHandlers } from "./hooks/useClipboardHandlers";
import { useDragDrop } from "./hooks/useDragDrop";
import { isBrowserMode } from "./vscode-api";

const lowlight = createLowlight(common);

export function App() {
  const handleUpdateRef = useRef<() => void>(() => {});
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const {
    settings,
    settingsRef,
    settingsVisible,
    setSettingsVisible,
    updateSettings,
    applySettings,
  } = useSettingsPanel(handleUpdateRef);

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
      MermaidBlock,
      createCodeBlock(lowlight),
      MathInline,
      MathBlock,
      YouTubeEmbed,
      GitHubEmbed,
      SlashCommand,
    ],
    editorProps: {
      attributes: { class: "tiptap-editor" },
    },
  });

  const {
    status,
    readonly,
    searchVisible,
    setSearchVisible,
    diffVisible,
    setDiffVisible,
    diffData,
    imageDialogVisible,
    setImageDialogVisible,
    baseUri,
    docFolderPath,
    uploadImage,
    currentMarkdown,
    switchToSource,
    openInBrowser,
    toggleDiff,
  } = useEditorState({ editor, settingsRef, handleUpdateRef, applySettings });

  useClipboardHandlers(editor, baseUri, docFolderPath, settingsRef, uploadImage);
  const { dragOver } = useDragDrop(editor, uploadImage, editorContainerRef);

  // Keyboard shortcuts (spans settings + search concerns)
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
  }, [setSearchVisible, setSettingsVisible]);

  if (!editor) return null;

  return (
    <div className="editor-layout">
      <div
        className={"editor-container" + (dragOver ? " drag-over" : "")}
        ref={editorContainerRef}
        style={
          resolveEditorSurface(settings)
            ? ({ ["--editor-surface-bg" as any]: resolveEditorSurface(settings) } as React.CSSProperties)
            : undefined
        }
      >
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
