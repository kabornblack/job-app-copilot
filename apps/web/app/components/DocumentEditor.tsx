"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** TipTap document root — uses TipTap's JSONContent (not unknown[]). */
export type TipTapDoc = JSONContent & {
  type: "doc";
};

function asTipTapDoc(value: JSONContent): TipTapDoc {
  return {
    ...value,
    type: "doc",
    content: value.content ?? [],
  };
}

type DocumentEditorProps = {
  title: string;
  applicationId: string;
  apiUrl: string;
  docType: "cv" | "cover_letter";
  initialJson: TipTapDoc | null;
  onSaved?: (payload: { content: string; contentJson: TipTapDoc }) => void;
};

type EditorMode = "write" | "preview";

const toolbarButtons = [
  { key: "h1", label: "H1" },
  { key: "h2", label: "H2" },
  { key: "bold", label: "Bold" },
  { key: "italic", label: "Italic" },
  { key: "bullets", label: "Bullets" },
] as const;

export default function DocumentEditor({
  title,
  applicationId,
  docType,
  initialJson,
  onSaved,
}: DocumentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    content: initialJson ?? ({ type: "doc", content: [] } satisfies TipTapDoc),
    immediatelyRender: false,
    onUpdate: () => {
      if (ignoreUpdatesRef.current) {
        return;
      }
      setDirty(true);
      setStatus(null);
      setError(null);
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
    setError(null);
    try {
      const contentJson = asTipTapDoc(editor.getJSON());
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
      const saved = (await response.json()) as {
        content?: string;
        contentJson?: JSONContent;
      };
      setDirty(false);
      setStatus("Saved.");
      onSaved?.({
        content: saved.content ?? "",
        contentJson: asTipTapDoc(saved.contentJson ?? contentJson),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (format: "docx" | "pdf") => {
    setDownloading(format);
    setStatus(null);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to download ${format}`);
    } finally {
      setDownloading(null);
    }
  };

  if (!editor) {
    return null;
  }

  const isToolbarActive = (key: (typeof toolbarButtons)[number]["key"]) => {
    switch (key) {
      case "h1":
        return editor.isActive("heading", { level: 1 });
      case "h2":
        return editor.isActive("heading", { level: 2 });
      case "bold":
        return editor.isActive("bold");
      case "italic":
        return editor.isActive("italic");
      case "bullets":
        return editor.isActive("bulletList");
    }
  };

  const runToolbarAction = (key: (typeof toolbarButtons)[number]["key"]) => {
    switch (key) {
      case "h1":
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        return;
      case "h2":
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        return;
      case "bold":
        editor.chain().focus().toggleBold().run();
        return;
      case "italic":
        editor.chain().focus().toggleItalic().run();
        return;
      case "bullets":
        editor.chain().focus().toggleBulletList().run();
    }
  };

  return (
    <section className="space-y-2">
      <h5 className="text-sm font-semibold">{title}</h5>

      <Tabs value={mode} onValueChange={(value) => setMode(value as EditorMode)}>
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "write" ? (
        <div className="flex flex-wrap gap-1">
          {toolbarButtons.map((button) => (
            <Button
              key={button.key}
              type="button"
              variant={isToolbarActive(button.key) ? "secondary" : "outline"}
              size="sm"
              onClick={() => runToolbarAction(button.key)}
            >
              {button.label}
            </Button>
          ))}
        </div>
      ) : null}

      {/* documents.ts: DOCX Calibri + 0.5" margins; PDF Helvetica + ~54pt.
          The preview styles below intentionally mimic the exported file's
          own typography, not the app theme — that's the point of Preview. */}
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
        className={
          mode === "preview"
            ? "rounded-md border bg-muted/60 px-3 py-4"
            : undefined
        }
      >
        <div
          className={cn(
            mode === "write" ? "doc-editor-write" : "doc-editor-preview",
            mode === "write"
              ? "min-h-[150px] rounded-md border bg-background p-2.5"
              : "mx-auto min-h-[520px] max-w-[680px] bg-white px-[54px] py-[54px] text-[#111111] shadow-[0_1px_4px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.08)]",
          )}
          style={
            mode === "preview"
              ? {
                  fontFamily: 'Calibri, "Segoe UI", Helvetica, Arial, sans-serif',
                  fontSize: 11,
                  lineHeight: 1.45,
                }
              : undefined
          }
        >
          {mode === "preview" ? (
            <div
              style={{
                fontFamily: 'Calibri, "Segoe UI", Helvetica, Arial, sans-serif',
                fontWeight: 700,
                fontSize: 16,
                color: "#111111",
                marginBottom: "0.9rem",
              }}
            >
              {title}
            </div>
          ) : null}
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty} size="sm">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={downloading !== null}
          onClick={() => void handleDownload("docx")}
        >
          {downloading === "docx" ? "Downloading…" : "Download DOCX"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={downloading !== null}
          onClick={() => void handleDownload("pdf")}
        >
          {downloading === "pdf" ? "Downloading…" : "Download PDF"}
        </Button>
        {status ? (
          <span className="text-sm text-success">{status}</span>
        ) : dirty ? (
          <span className="text-sm text-warning">Unsaved changes</span>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
