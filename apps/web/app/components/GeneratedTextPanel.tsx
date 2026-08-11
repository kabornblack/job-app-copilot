"use client";

import DocumentEditor, { type TipTapDoc } from "./DocumentEditor";
import { Card, CardContent } from "@/components/ui/card";

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
      <Card size="sm" className="bg-muted/40">
        <CardContent className="space-y-1">
          <p className="text-sm font-medium">No generated draft yet.</p>
          <p className="text-sm text-muted-foreground">
            Click Generate CV or Generate Cover Letter, edit in the rich text
            editor, Save, then download DOCX/PDF.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <h4 className="text-sm font-semibold">Review &amp; edit documents</h4>
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
          <p className="text-sm text-warning">
            CV text exists but has no structured draft yet — regenerate to
            open the editor.
          </p>
        ) : null}
        {!generatedCoverLetterJson && generatedCoverLetter ? (
          <p className="text-sm text-warning">
            Cover letter text exists but has no structured draft yet —
            regenerate to open the editor.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
