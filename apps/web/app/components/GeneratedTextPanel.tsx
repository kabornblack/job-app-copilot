"use client";

type GeneratedTextPanelProps = {
  applicationId: string;
  apiUrl: string;
  generatedCV?: string | null;
  generatedCoverLetter?: string | null;
};

function downloadUrl(
  apiUrl: string,
  applicationId: string,
  docType: "cv" | "cover_letter",
  format: "docx" | "pdf",
) {
  return `${apiUrl}/applications/${applicationId}/documents/${docType}/download?format=${format}`;
}

function DocumentSection({
  title,
  text,
  applicationId,
  apiUrl,
  docType,
}: {
  title: string;
  text: string;
  applicationId: string;
  apiUrl: string;
  docType: "cv" | "cover_letter";
}) {
  return (
    <section style={{ marginBottom: "1rem" }}>
      <h5>{title}</h5>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <a
          href={downloadUrl(apiUrl, applicationId, docType, "docx")}
          style={{ padding: "0.4rem 0.75rem", border: "1px solid #ccc" }}
        >
          Download DOCX
        </a>
        <a
          href={downloadUrl(apiUrl, applicationId, docType, "pdf")}
          style={{ padding: "0.4rem 0.75rem", border: "1px solid #ccc" }}
        >
          Download PDF
        </a>
      </div>
      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>
    </section>
  );
}

export default function GeneratedTextPanel({
  applicationId,
  apiUrl,
  generatedCV,
  generatedCoverLetter,
}: GeneratedTextPanelProps) {
  if (!generatedCV && !generatedCoverLetter) {
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
        <strong>No generated text yet.</strong>
        <p style={{ margin: "0.5rem 0 0" }}>
          Click Generate CV or Generate Cover Letter to create plain text
          output.
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
      <h4 style={{ marginTop: 0 }}>Generated documents</h4>
      {generatedCV ? (
        <DocumentSection
          title="CV"
          text={generatedCV}
          applicationId={applicationId}
          apiUrl={apiUrl}
          docType="cv"
        />
      ) : null}
      {generatedCoverLetter ? (
        <DocumentSection
          title="Cover Letter"
          text={generatedCoverLetter}
          applicationId={applicationId}
          apiUrl={apiUrl}
          docType="cover_letter"
        />
      ) : null}
    </div>
  );
}
