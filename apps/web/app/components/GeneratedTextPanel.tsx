"use client";

type GeneratedTextPanelProps = {
  generatedCV?: string | null;
  generatedCoverLetter?: string | null;
};

export default function GeneratedTextPanel({
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
        <section style={{ marginBottom: "1rem" }}>
          <h5>CV</h5>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{generatedCV}</pre>
        </section>
      ) : null}
      {generatedCoverLetter ? (
        <section>
          <h5>Cover Letter</h5>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {generatedCoverLetter}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
