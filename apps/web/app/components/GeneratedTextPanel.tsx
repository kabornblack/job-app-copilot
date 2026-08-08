"use client";

import DocumentEditor, { type TipTapDoc } from "./DocumentEditor";

type GeneratedTextPanelProps = {
  applicationId: string;
  apiUrl: string;
  generatedCV?: string | null;
  generatedCoverLetter?: string | null;
  generatedCVJson?: TipTapDoc | null;
  generatedCoverLetterJson?: TipTapDoc | null;
  onDocumentSaved?: (
    docType: "cv" | "cover_letter",
    payload: { content: string; contentJson: TipTapDoc },
  ) => void;
};

export default function GeneratedTextPanel({
  applicationId,
  apiUrl,
  generatedCV,
  generatedCoverLetter,
  generatedCVJson,
  generatedCoverLetterJson,
  onDocumentSaved,
}: GeneratedTextPanelProps) {
  if (!generatedCVJson && !generatedCoverLetterJson && !generatedCV && !generatedCoverLetter) {
    return (
      <div
        style={{
          marginTop: "1rem",
          padding: "1rem",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <strong>No generated draft yet.</strong>
        <p style={{ margin: "0.5rem 0 0" }}>
          Click Generate CV or Generate Cover Letter, edit in the rich text
          editor, Save, then download DOCX/PDF.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#f4faff",
      }}
    >
      <h4 style={{ marginTop: 0 }}>Review & edit documents</h4>
      {generatedCVJson ? (
        <DocumentEditor
          title="CV"
          applicationId={applicationId}
          apiUrl={apiUrl}
          docType="cv"
          initialJson={generatedCVJson}
          onSaved={(payload) => onDocumentSaved?.("cv", payload)}
        />
      ) : null}
      {generatedCoverLetterJson ? (
        <DocumentEditor
          title="Cover Letter"
          applicationId={applicationId}
          apiUrl={apiUrl}
          docType="cover_letter"
          initialJson={generatedCoverLetterJson}
          onSaved={(payload) => onDocumentSaved?.("cover_letter", payload)}
        />
      ) : null}
      {!generatedCVJson && generatedCV ? (
        <p style={{ color: "#a40" }}>
          CV text exists but has no structured draft yet — regenerate to open
          the editor.
        </p>
      ) : null}
      {!generatedCoverLetterJson && generatedCoverLetter ? (
        <p style={{ color: "#a40" }}>
          Cover letter text exists but has no structured draft yet — regenerate
          to open the editor.
        </p>
      ) : null}
    </div>
  );
}
