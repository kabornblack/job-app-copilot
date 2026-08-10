"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

export type TipTapDoc = {
  type: "doc";
  content?: unknown[];
};

type DocumentEditorProps = {
  title: string;
  applicationId: string;
  apiUrl: string;
  docType: "cv" | "cover_letter";
  initialJson: TipTapDoc | null;
  onSaved?: (payload: { content: string; contentJson: TipTapDoc }) => void;
};

type EditorMode = "write" | "preview";

export default function DocumentEditor({
  title,
  applicationId,
  apiUrl: _apiUrl,
  docType,
  initialJson,
  onSaved,
}: DocumentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<EditorMode>("write");
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const ignoreUpdatesRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        orderedList: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
      }),
    ],
    content: initialJson ?? { type: "doc", content: [] },
    immediatelyRender: false,
    onUpdate: () => {
      if (ignoreUpdatesRef.current) {
        return;
      }
      setDirty(true);
      setStatus(null);
    },
  });

  useEffect(() => {
    if (!editor || !initialJson) {
      return;
    }
    ignoreUpdatesRef.current = true;
    editor.commands.setContent(initialJson, { emitUpdate: false });
    setDirty(false);
    setStatus(null);
    queueMicrotask(() => {
      ignoreUpdatesRef.current = false;
    });
  }, [editor, initialJson]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    ignoreUpdatesRef.current = true;
    editor.setEditable(mode === "write");
    queueMicrotask(() => {
      ignoreUpdatesRef.current = false;
    });
  }, [editor, mode]);

  const handleSave = async () => {
    if (!editor) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const contentJson = editor.getJSON() as TipTapDoc;
      const response = await apiFetch(
        `/applications/${applicationId}/documents/${docType}`,
        {
          method: "PATCH",
          body: JSON.stringify({ contentJson }),
        },
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save document");
      }
      const saved = await response.json();
      setDirty(false);
      setStatus("Saved.");
      onSaved?.({
        content: saved.content ?? "",
        contentJson: saved.contentJson as TipTapDoc,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (format: "docx" | "pdf") => {
    setDownloading(format);
    setStatus(null);
    try {
      const response = await apiFetch(
        `/applications/${applicationId}/documents/${docType}/download?format=${format}`,
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to download ${format}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${docType}.${format}`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setStatus(`Downloaded ${format.toUpperCase()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  if (!editor) {
    return null;
  }

  const tabButtonStyle = (active: boolean) => ({
    padding: "0.4rem 0.85rem",
    border: active ? "1px solid #2d3748" : "1px solid #cbd5e0",
    borderBottom: active ? "1px solid #fff" : "1px solid #cbd5e0",
    background: active ? "#fff" : "#edf2f7",
    color: "#1a202c",
    borderRadius: "6px 6px 0 0",
    marginBottom: -1,
    fontWeight: active ? 700 : 500,
    cursor: "pointer" as const,
  });

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h5 style={{ marginBottom: "0.5rem" }}>{title}</h5>
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid #cbd5e0",
          marginBottom: "0.75rem",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("write")}
          style={tabButtonStyle(mode === "write")}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          style={tabButtonStyle(mode === "preview")}
        >
          Preview
        </button>
      </div>

      {mode === "write" ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            marginBottom: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            style={{
              padding: "0.35rem 0.6rem",
              fontWeight: editor.isActive("heading", { level: 1 }) ? 700 : 400,
            }}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            style={{
              padding: "0.35rem 0.6rem",
              fontWeight: editor.isActive("heading", { level: 2 }) ? 700 : 400,
            }}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            style={{
              padding: "0.35rem 0.6rem",
              fontWeight: editor.isActive("bold") ? 700 : 400,
            }}
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            style={{
              padding: "0.35rem 0.6rem",
              fontStyle: editor.isActive("italic") ? "italic" : "normal",
            }}
          >
            Italic
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            style={{
              padding: "0.35rem 0.6rem",
              fontWeight: editor.isActive("bulletList") ? 700 : 400,
            }}
          >
            Bullets
          </button>
        </div>
      ) : null}

      <style>{`
        .doc-editor-write .ProseMirror { outline: none; min-height: 140px; }
        .doc-editor-write .ProseMirror h1 { font-size: 1.4rem; margin: 0.6rem 0 0.35rem; }
        .doc-editor-write .ProseMirror h2 { font-size: 1.15rem; margin: 0.55rem 0 0.3rem; }
        .doc-editor-write .ProseMirror p { margin: 0.35rem 0; }
        .doc-editor-write .ProseMirror ul { padding-left: 1.25rem; margin: 0.35rem 0; }

        .doc-editor-preview .ProseMirror { outline: none; cursor: default; min-height: 0; }
        .doc-editor-preview .ProseMirror h1 {
          font-family: Calibri, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #111111;
          margin: 0.85rem 0 0.35rem;
        }
        .doc-editor-preview .ProseMirror h2 {
          font-family: Calibri, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 12px;
          font-weight: 700;
          color: #111111;
          margin: 0.75rem 0 0.3rem;
        }
        .doc-editor-preview .ProseMirror p {
          font-family: Calibri, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 11px;
          color: #222222;
          margin: 0 0 0.55rem;
          line-height: 1.45;
        }
        .doc-editor-preview .ProseMirror ul {
          font-family: Calibri, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 11px;
          color: #222222;
          padding-left: 1.35rem;
          margin: 0.2rem 0 0.55rem;
        }
        .doc-editor-preview .ProseMirror li {
          margin: 0.15rem 0;
          line-height: 1.4;
        }
        .doc-editor-preview .ProseMirror strong { font-weight: 700; }
        .doc-editor-preview .ProseMirror em { font-style: italic; }
      `}</style>

      <div
        style={
          mode === "preview"
            ? {
                background: "#e8e8e8",
                padding: "1.25rem 1rem",
                marginBottom: "0.75rem",
                borderRadius: 6,
                border: "1px solid #c5c5c5",
              }
            : { marginBottom: "0.75rem" }
        }
      >
        {/* documents.ts: DOCX Calibri + 0.5" margins; PDF Helvetica + ~54pt */}
        <div
          className={
            mode === "write" ? "doc-editor-write" : "doc-editor-preview"
          }
          style={
            mode === "write"
              ? {
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "0.75rem",
                  minHeight: 180,
                  background: "white",
                }
              : {
                  maxWidth: 680,
                  margin: "0 auto",
                  background: "#ffffff",
                  boxShadow:
                    "0 1px 4px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.08)",
                  padding: "54px 54px",
                  minHeight: 520,
                  color: "#111111",
                  fontFamily:
                    'Calibri, "Segoe UI", Helvetica, Arial, sans-serif',
                  fontSize: 11,
                  lineHeight: 1.45,
                }
          }
        >
          <div
            aria-hidden={mode !== "preview"}
            style={{
              display: mode === "preview" ? "block" : "none",
              fontFamily: 'Calibri, "Segoe UI", Helvetica, Arial, sans-serif',
              fontWeight: 700,
              fontSize: 16,
              color: "#111111",
              marginBottom: "0.9rem",
            }}
          >
            {title}
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{ padding: "0.5rem 0.9rem" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={downloading !== null}
          onClick={() => void handleDownload("docx")}
          style={{ padding: "0.5rem 0.9rem" }}
        >
          {downloading === "docx" ? "Downloading…" : "Download DOCX"}
        </button>
        <button
          type="button"
          disabled={downloading !== null}
          onClick={() => void handleDownload("pdf")}
          style={{ padding: "0.5rem 0.9rem" }}
        >
          {downloading === "pdf" ? "Downloading…" : "Download PDF"}
        </button>
      </div>
      {status ? (
        <p style={{ margin: "0.5rem 0 0", color: dirty ? "#a40" : "#285" }}>
          {status}
        </p>
      ) : dirty ? (
        <p style={{ margin: "0.5rem 0 0", color: "#a40" }}>Unsaved changes</p>
      ) : null}
    </section>
  );
}
