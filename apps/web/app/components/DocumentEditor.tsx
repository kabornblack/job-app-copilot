"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";

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

function downloadUrl(
  apiUrl: string,
  applicationId: string,
  docType: "cv" | "cover_letter",
  format: "docx" | "pdf",
) {
  return `${apiUrl}/applications/${applicationId}/documents/${docType}/download?format=${format}`;
}

export default function DocumentEditor({
  title,
  applicationId,
  apiUrl,
  docType,
  initialJson,
  onSaved,
}: DocumentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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
      setDirty(true);
      setStatus(null);
    },
  });

  useEffect(() => {
    if (!editor || !initialJson) {
      return;
    }
    editor.commands.setContent(initialJson);
    setDirty(false);
    setStatus(null);
  }, [editor, initialJson]);

  const handleSave = async () => {
    if (!editor) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const contentJson = editor.getJSON() as TipTapDoc;
      const response = await fetch(
        `${apiUrl}/applications/${applicationId}/documents/${docType}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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

  if (!editor) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h5 style={{ marginBottom: "0.5rem" }}>{title}</h5>
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
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: "0.75rem",
          minHeight: 180,
          background: "white",
          marginBottom: "0.75rem",
        }}
      >
        <style>{`
          .ProseMirror { outline: none; min-height: 140px; }
          .ProseMirror h1 { font-size: 1.4rem; margin: 0.6rem 0 0.35rem; }
          .ProseMirror h2 { font-size: 1.15rem; margin: 0.55rem 0 0.3rem; }
          .ProseMirror p { margin: 0.35rem 0; }
          .ProseMirror ul { padding-left: 1.25rem; margin: 0.35rem 0; }
        `}</style>
        <EditorContent editor={editor} />
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
        <a
          href={downloadUrl(apiUrl, applicationId, docType, "docx")}
          style={{ padding: "0.5rem 0.9rem", border: "1px solid #ccc" }}
        >
          Download DOCX
        </a>
        <a
          href={downloadUrl(apiUrl, applicationId, docType, "pdf")}
          style={{ padding: "0.5rem 0.9rem", border: "1px solid #ccc" }}
        >
          Download PDF
        </a>
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
