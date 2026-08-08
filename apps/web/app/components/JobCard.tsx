"use client";
import { useState } from "react";
import GeneratedTextPanel from "./GeneratedTextPanel";
import type { TipTapDoc } from "./DocumentEditor";

export type JobSummary = {
  applicationId: string;
  jobId: string;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  url: string;
  score: number;
  explanation: string;
  status: string;
  generatedCV?: string | null;
  generatedCoverLetter?: string | null;
  generatedCVJson?: TipTapDoc | null;
  generatedCoverLetterJson?: TipTapDoc | null;
};

export type GeneratedDocumentResult = {
  content: string | null;
  contentJson: TipTapDoc | null;
};

type JobCardProps = {
  job: JobSummary;
  apiUrl: string;
  onGenerate: (
    applicationId: string,
    docType: "cv" | "cover_letter",
  ) => Promise<GeneratedDocumentResult | null>;
  onStatusChange: (applicationId: string, status: string) => Promise<void>;
};

export default function JobCard({
  job,
  apiUrl,
  onGenerate,
  onStatusChange,
}: JobCardProps) {
  const [loadingGenerate, setLoadingGenerate] = useState<
    "cv" | "cover_letter" | null
  >(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [generatedCV, setGeneratedCV] = useState<string | null>(
    job.generatedCV ?? null,
  );
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState<
    string | null
  >(job.generatedCoverLetter ?? null);
  const [generatedCVJson, setGeneratedCVJson] = useState<TipTapDoc | null>(
    job.generatedCVJson ?? null,
  );
  const [generatedCoverLetterJson, setGeneratedCoverLetterJson] =
    useState<TipTapDoc | null>(job.generatedCoverLetterJson ?? null);
  const [status, setStatus] = useState(job.status);

  const handleGenerate = async (docType: "cv" | "cover_letter") => {
    setLoadingGenerate(docType);
    try {
      const result = await onGenerate(job.applicationId, docType);
      if (result) {
        if (docType === "cv") {
          setGeneratedCV(result.content);
          setGeneratedCVJson(result.contentJson);
        } else {
          setGeneratedCoverLetter(result.content);
          setGeneratedCoverLetterJson(result.contentJson);
        }
      }
    } finally {
      setLoadingGenerate(null);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setLoadingStatus(true);
    try {
      await onStatusChange(job.applicationId, newStatus);
      setStatus(newStatus);
    } finally {
      setLoadingStatus(false);
    }
  };

  return (
    <article
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: "1rem",
        marginBottom: "1rem",
        background: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 0.25rem" }}>{job.title}</h3>
          <p style={{ margin: 0, color: "#555" }}>
            {job.company} · {job.location ?? "Location unknown"} ·{" "}
            {job.remoteType ?? "Remote info unknown"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong>Status:</strong> {status}
          <br />
          <strong>Score:</strong> {job.score.toFixed(1)}
        </div>
      </div>
      <p style={{ margin: "0.75rem 0" }}>
        <strong>Why match:</strong> {job.explanation}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => handleGenerate("cv")}
          disabled={loadingGenerate !== null}
          style={{ padding: "0.75rem 1rem" }}
        >
          {loadingGenerate === "cv"
            ? "Generating CV…"
            : generatedCVJson
              ? "Regenerate CV"
              : "Generate CV"}
        </button>
        <button
          type="button"
          onClick={() => handleGenerate("cover_letter")}
          disabled={loadingGenerate !== null}
          style={{ padding: "0.75rem 1rem" }}
        >
          {loadingGenerate === "cover_letter"
            ? "Generating cover letter…"
            : generatedCoverLetterJson
              ? "Regenerate Cover Letter"
              : "Generate Cover Letter"}
        </button>
        <button
          type="button"
          onClick={() => handleStatusUpdate("reviewing")}
          disabled={loadingStatus}
          style={{ padding: "0.75rem 1rem" }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => handleStatusUpdate("rejected")}
          disabled={loadingStatus}
          style={{ padding: "0.75rem 1rem", background: "#ffecec" }}
        >
          Reject
        </button>
      </div>
      <GeneratedTextPanel
        applicationId={job.applicationId}
        apiUrl={apiUrl}
        generatedCV={generatedCV}
        generatedCoverLetter={generatedCoverLetter}
        generatedCVJson={generatedCVJson}
        generatedCoverLetterJson={generatedCoverLetterJson}
        onDocumentSaved={(docType, payload) => {
          if (docType === "cv") {
            setGeneratedCV(payload.content);
            setGeneratedCVJson(payload.contentJson);
          } else {
            setGeneratedCoverLetter(payload.content);
            setGeneratedCoverLetterJson(payload.contentJson);
          }
        }}
      />
    </article>
  );
}
