import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import {
  markdownToHtml,
  htmlToMarkdown,
  htmlToMarkdownSync,
} from "./useVSCodeSync";
import { extractFrontmatter, prependFrontmatter } from "../frontmatter";
import { mergeSettings, type BetterMarkdownSettings } from "../settings";
import { vscodeApi, isBrowserMode } from "../vscode-api";

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

interface UseEditorStateOptions {
  editor: Editor | null;
  settingsRef: MutableRefObject<BetterMarkdownSettings>;
  handleUpdateRef: MutableRefObject<() => void>;
  applySettings: (s: BetterMarkdownSettings) => void;
}

export function useEditorState({
  editor,
  settingsRef,
  handleUpdateRef,
  applySettings,
}: UseEditorStateOptions) {
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const filePath = useRef("");
  const frontmatterRef = useRef("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadonly = useRef(false);

  const [status, setStatus] = useState<string | null>("Loading document...");
  const [readonly, setReadonly] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);
  const [diffData, setDiffData] = useState<{
    headContent: string;
    fileName: string;
  } | null>(null);
  const [imageDialogVisible, setImageDialogVisible] = useState(false);

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
      vscodeApi.postMessage({
        type: "uploadImage",
        data: base64,
        filename: name,
      });
    });
  }, []);

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
          applySettings(mergeSettings(msg.settings));
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
            // Place the caret: restore the last-known position for this
            // file if we have one, otherwise drop it inside the first
            // heading (usually the title). Falls back to doc start.
            const maxPos = editor.state.doc.content.size;
            let targetPos: number | null = null;
            if (typeof msg.cursorPosition === "number") {
              targetPos = Math.max(0, Math.min(msg.cursorPosition, maxPos));
            } else {
              editor.state.doc.descendants((n, pos) => {
                if (targetPos !== null) return false;
                if (n.type.name === "heading") {
                  targetPos = pos + 1;
                  return false;
                }
                return true;
              });
            }
            if (targetPos !== null) {
              editor.commands.setTextSelection(targetPos);
            }
            editor.commands.focus();
          } catch (err: any) {
            setStatus(`Parse error: ${err?.message || err}`);
          }
        }
        setStatus(null);
      } else if (msg.type === "update" && initialized.current) {
        try {
          const { content: noFm, frontmatter } = extractFrontmatter(
            msg.content,
          );
          frontmatterRef.current = frontmatter;
          const html = await markdownToHtml(noFm, baseUri.current);
          // setContent resets the ProseMirror selection to the doc end.
          // Snapshot the caret before replacing content and restore it
          // (clamped to the new doc size) so external updates — e.g. VS
          // Code's own Cmd+Z firing a document change that echoes back —
          // don't yank the cursor to the end of the file.
          const { from, to } = editor.state.selection;
          const wasFocused = editor.isFocused;
          editor.commands.setContent(html);
          const maxPos = editor.state.doc.content.size;
          editor.commands.setTextSelection({
            from: Math.min(from, maxPos),
            to: Math.min(to, maxPos),
          });
          if (wasFocused) editor.commands.focus();
        } catch {
          // Ignore parse failures on external updates
        }
      } else if (msg.type === "openSearch") {
        setSearchVisible(true);
      } else if (msg.type === "settingsUpdated") {
        applySettings(mergeSettings(msg.settings));
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
  }, [editor, applySettings]);

  // Restore cursor when the webview regains focus.
  // ProseMirror keeps the selection in state across blur, but the DOM
  // selection gets cleared when the window/tab loses focus. Track whether
  // the editor was the last-focused element and, on window focus, call
  // editor.commands.focus() to re-apply the DOM selection from state.
  useEffect(() => {
    if (!editor) return;
    let editorWasLastFocused = false;
    const onFocusIn = (e: FocusEvent) => {
      editorWasLastFocused = editor.view.dom.contains(e.target as Node);
    };
    const onWindowFocus = () => {
      if (editorWasLastFocused) editor.commands.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focus", onWindowFocus);
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
      // Embed fallback links (YouTube / GitHub cards) mark themselves so a
      // plain click opens externally instead of just consuming the event.
      const alwaysExternal = anchor.getAttribute("data-external") === "true";
      if (alwaysExternal || e.metaKey || e.ctrlKey || e.button === 1) {
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
    return () =>
      window.removeEventListener("btrmk:showImageDialog", handler);
  }, []);

  // Sync: editor changes → extension host
  const handleUpdate = useCallback(() => {
    if (!initialized.current || !editor) return;
    if (isReadonly.current) return;
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
  }, [editor, settingsRef]);

  useEffect(() => {
    if (!editor) return;
    handleUpdateRef.current = handleUpdate;
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, handleUpdate, handleUpdateRef]);

  // Persist the caret position per file so reopening a file lands the user
  // where they left off. Debounced to avoid flooding the host on every
  // selection tick.
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSelection = () => {
      if (!initialized.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const { from } = editor.state.selection;
          vscodeApi.postMessage({ type: "saveCursor", position: from });
        } catch {
          /* ignore */
        }
      }, 500);
    };
    editor.on("selectionUpdate", onSelection);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor]);

  const switchToSource = useCallback(() => {
    vscodeApi.postMessage({ type: "toggleEditor" });
  }, []);

  const openInBrowser = useCallback(() => {
    vscodeApi.postMessage({ type: "openInBrowser" });
  }, []);

  const toggleDiff = useCallback(() => {
    if (diffVisible) {
      setDiffVisible(false);
      return;
    }
    setDiffVisible(true);
    vscodeApi.postMessage({ type: "requestGitDiff" });
  }, [diffVisible]);

  // Current editor content as markdown (for the diff "new" side)
  const currentMarkdown = useMemo(() => {
    if (!editor || !diffVisible) return "";
    try {
      const html = editor.getHTML();
      return htmlToMarkdownSync(
        html,
        baseUri.current,
        docFolderPath.current,
        settingsRef.current,
      );
    } catch {
      return "";
    }
  }, [editor, diffVisible, diffData, settingsRef]);

  return {
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
  };
}
