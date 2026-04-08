import React, { useState, useRef, useEffect } from "react";

interface ImageInsertDialogProps {
  visible: boolean;
  onInsert: (src: string) => void;
  onClose: () => void;
  onUploadFile: (file: File) => Promise<string>;
}

export function ImageInsertDialog({
  visible,
  onInsert,
  onClose,
  onUploadFile,
}: ImageInsertDialogProps) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setUrl("");
      setError(null);
      setSelectedFile(null);
      setPreview(null);
      setUploading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  if (!visible) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUrl("");
    }
  };

  const handleInsert = async () => {
    setError(null);
    if (selectedFile) {
      setUploading(true);
      try {
        const src = await onUploadFile(selectedFile);
        onInsert(src);
      } catch (err: any) {
        setError(err?.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    } else if (url.trim()) {
      onInsert(url.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (url.trim() || selectedFile)) handleInsert();
    if (e.key === "Escape") onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) {
      setSelectedFile(file);
      setUrl("");
    }
  };

  return (
    <div className="image-dialog-overlay" onClick={onClose}>
      <div
        className="image-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="image-dialog-header">
          <span>Insert Image</span>
          <button className="image-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="image-dialog-label">URL</label>
        <input
          ref={inputRef}
          type="text"
          className="image-dialog-input"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSelectedFile(null);
          }}
          placeholder="https://example.com/photo.jpg"
          disabled={uploading}
        />

        <div className="image-dialog-divider">
          <span>or choose a file</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          className="image-dialog-file-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {selectedFile ? selectedFile.name : "Choose file\u2026"}
        </button>

        {preview && (
          <div className="image-dialog-preview">
            <img src={preview} alt="Preview" />
          </div>
        )}

        {url.trim() && !selectedFile && (
          <div className="image-dialog-preview">
            <img
              src={url.trim()}
              alt="Preview"
              onError={(e) =>
                ((e.target as HTMLImageElement).style.display = "none")
              }
            />
          </div>
        )}

        {error && <div className="image-dialog-error">{error}</div>}

        <div className="image-dialog-actions">
          <button
            className="image-dialog-btn cancel"
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            className="image-dialog-btn insert"
            onClick={handleInsert}
            disabled={uploading || (!url.trim() && !selectedFile)}
          >
            {uploading ? "Uploading\u2026" : "Insert"}
          </button>
        </div>
      </div>
    </div>
  );
}
