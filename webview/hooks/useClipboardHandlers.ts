import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { htmlToMarkdownSync } from "./useVSCodeSync";
import type { BetterMarkdownSettings } from "../settings";

export function useClipboardHandlers(
  editor: Editor | null,
  baseUri: MutableRefObject<string>,
  docFolderPath: MutableRefObject<string>,
  settingsRef: MutableRefObject<BetterMarkdownSettings>,
  uploadImage: (file: File) => Promise<string>,
): void {
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
  }, [editor, baseUri, docFolderPath, settingsRef]);

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
}
