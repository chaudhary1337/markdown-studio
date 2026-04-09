import { useState, useEffect } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/react";

export function useDragDrop(
  editor: Editor | null,
  uploadImage: (file: File) => Promise<string>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!editor || !container) return;

    const dragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const handleDragOver = (e: DragEvent) => {
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
          editor
            .chain()
            .insertContentAt(pos, { type: "image", attrs: { src } })
            .run();
        } catch (err) {
          console.error("[better-markdown] image drop failed:", err);
        }
      });
    };

    container.addEventListener("dragenter", dragEnter);
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", dragLeave);
    container.addEventListener("drop", drop);
    return () => {
      container.removeEventListener("dragenter", dragEnter);
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("dragleave", dragLeave);
      container.removeEventListener("drop", drop);
    };
  }, [editor, uploadImage, containerRef]);

  return { dragOver };
}
