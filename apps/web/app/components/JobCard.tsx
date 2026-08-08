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

const PRE_APPLICATION_STATUSES = new Set(["found", "reviewing", "tailored"]);
const POST_APPLICATION_STATUSES = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;

type JobCardProps = {
  job: JobSummary;
  apiUrl: string;
  onGenerate: (
    applicationId: string,
    docType: "cv" | "cover_letter",
  ) => Promise<GeneratedDocumentResult | null>;
  onStatusChange: (applicationId: string, status: string) => Promise<void>;
};

function statusBadgeStyle(status: string): {
  display: "inline-block";
  padding: string;
  borderRadius: number;
  fontSize: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase";
  background: string;
  color: string;
} {
  const postApplied = !PRE_APPLICATION_STATUSES.has(status);
  return {
    display: "inline-block",
    padding: "0.2rem 0.55rem",
    borderRadius: 4,
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    background: postApplied ? "#4a5568" : "#e2e8f0",
    color: postApplied ? "#fff" : "#1a202c",
  };
}

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

  const hasDocuments = Boolean(generatedCVJson || generatedCoverLetterJson);
  const isPreApplication = PRE_APPLICATION_STATUSES.has(status);
  const isPostApplication = !isPreApplication;

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
    if (newStatus === status) {
      return;
    }
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
        border: isPostApplication ? "1px solid #a0aec0" : "1px solid #ddd",
        borderLeft: isPostApplication
          ? "4px solid #4a5568"
          : "1px solid #ddd",
        borderRadius: 12,
        padding: "1rem",
        marginBottom: "1rem",
        background: isPostApplication ? "#edf2f7" : "white",
        opacity: isPostApplication ? 0.92 : 1,
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
          <span style={statusBadgeStyle(status)}>{status}</span>
          <div style={{ marginTop: "0.35rem" }}>
            <strong>Score:</strong> {job.score.toFixed(1)}
          </div>
        </div>
      </div>
      <p style={{ margin: "0.75rem 0" }}>
        <strong>Why match:</strong> {job.explanation}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "0.75rem 1rem",
            border: "1px solid #2b6cb0",
            background: "#ebf8ff",
            color: "#2b6cb0",
            textDecoration: "none",
            borderRadius: 4,
          }}
        >
          Apply on {job.company}&apos;s site
        </a>
        {isPreApplication ? (
          <>
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
              Shortlist
            </button>
            <button
              type="button"
              onClick={() => handleStatusUpdate("rejected")}
              disabled={loadingStatus}
              style={{ padding: "0.75rem 1rem", background: "#ffecec" }}
            >
              Skip
            </button>
            {hasDocuments ? (
              <button
                type="button"
                onClick={() => handleStatusUpdate("applied")}
                disabled={loadingStatus}
                style={{
                  padding: "0.75rem 1rem",
                  background: "#276749",
                  color: "white",
                  border: "none",
                }}
              >
                Mark as applied
              </button>
            ) : null}
          </>
        ) : (
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Update status</span>
            <select
              value={status}
              disabled={loadingStatus}
              onChange={(event) => handleStatusUpdate(event.target.value)}
              style={{ padding: "0.6rem 0.75rem" }}
            >
              {POST_APPLICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
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
