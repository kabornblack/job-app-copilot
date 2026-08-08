"use client";
import { useEffect, useMemo, useState } from "react";
import JobCard, {
  type GeneratedDocumentResult,
  type JobSummary,
} from "./JobCard";

type ReviewQueueProps = {
  apiUrl: string;
  refreshKey: number;
};

type QueueTab = "to_review" | "applied" | "archived";

const TAB_STATUSES: Record<QueueTab, Set<string>> = {
  to_review: new Set(["found", "reviewing", "tailored"]),
  applied: new Set(["applied", "interviewing"]),
  archived: new Set(["offer", "rejected", "withdrawn"]),
};

const TAB_LABELS: Record<QueueTab, string> = {
  to_review: "To review",
  applied: "Applied",
  archived: "Archived",
};

export default function ReviewQueue({ apiUrl, refreshKey }: ReviewQueueProps) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTab>("to_review");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/applications/review-queue`)
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load review queue");
        }
        return response.json();
      })
      .then((payload) => {
        setJobs(payload.queue ?? []);
      })
      .catch((err) => {
        setError(err.message ?? "Unable to load review queue");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiUrl, refreshKey]);

  const updateJob = (applicationId: string, update: Partial<JobSummary>) => {
    setJobs((previous) =>
      previous.map((job) =>
        job.applicationId === applicationId ? { ...job, ...update } : job,
      ),
    );
  };

  const handleGenerate = async (
    applicationId: string,
    docType: "cv" | "cover_letter",
  ): Promise<GeneratedDocumentResult | null> => {
    const response = await fetch(
      `${apiUrl}/applications/${applicationId}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: docType }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to generate text");
    }

    const generated = await response.json();
    const content = generated.content ?? null;
    const contentJson = generated.contentJson ?? null;
    updateJob(
      applicationId,
      docType === "cv"
        ? { generatedCV: content, generatedCVJson: contentJson }
        : {
            generatedCoverLetter: content,
            generatedCoverLetterJson: contentJson,
          },
    );
    return { content, contentJson };
  };

  const handleStatusChange = async (applicationId: string, status: string) => {
    const response = await fetch(
      `${apiUrl}/applications/${applicationId}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to update status");
    }

    const updated = await response.json();
    updateJob(applicationId, { status: updated.status });
  };

  const counts = useMemo(() => {
    const result: Record<QueueTab, number> = {
      to_review: 0,
      applied: 0,
      archived: 0,
    };
    for (const job of jobs) {
      if (TAB_STATUSES.to_review.has(job.status)) {
        result.to_review += 1;
      } else if (TAB_STATUSES.applied.has(job.status)) {
        result.applied += 1;
      } else if (TAB_STATUSES.archived.has(job.status)) {
        result.archived += 1;
      }
    }
    return result;
  }, [jobs]);

  const filteredJobs = jobs.filter((job) =>
    TAB_STATUSES[activeTab].has(job.status),
  );

  return (
    <section>
      <h2>Review queue</h2>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        {(Object.keys(TAB_LABELS) as QueueTab[]).map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.55rem 0.9rem",
                border: selected ? "1px solid #2d3748" : "1px solid #cbd5e0",
                background: selected ? "#2d3748" : "#fff",
                color: selected ? "#fff" : "#1a202c",
                borderRadius: 6,
              }}
            >
              {TAB_LABELS[tab]} ({counts[tab]})
            </button>
          );
        })}
      </div>
      {loading ? (
        <p>Loading review queue…</p>
      ) : error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : jobs.length === 0 ? (
        <p>
          No jobs in the review queue yet. Submit a profile to start a search.
        </p>
      ) : filteredJobs.length === 0 ? (
        <p>No jobs in “{TAB_LABELS[activeTab]}” right now.</p>
      ) : (
        filteredJobs.map((job) => (
          <JobCard
            key={job.applicationId}
            job={job}
            apiUrl={apiUrl}
            onGenerate={handleGenerate}
            onStatusChange={handleStatusChange}
          />
        ))
      )}
    </section>
  );
}
