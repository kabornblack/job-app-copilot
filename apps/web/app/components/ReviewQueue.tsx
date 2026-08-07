"use client";
import { useEffect, useState } from "react";
import JobCard, { type JobSummary } from "./JobCard";

type ReviewQueueProps = {
  apiUrl: string;
  refreshKey: number;
};

export default function ReviewQueue({ apiUrl, refreshKey }: ReviewQueueProps) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  ) => {
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
    updateJob(
      applicationId,
      docType === "cv"
        ? { generatedCV: content }
        : { generatedCoverLetter: content },
    );
    return content;
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

  return (
    <section>
      <h2>Review queue</h2>
      {loading ? (
        <p>Loading review queue…</p>
      ) : error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : jobs.length === 0 ? (
        <p>
          No jobs in the review queue yet. Submit a profile to start a search.
        </p>
      ) : (
        jobs.map((job) => (
          <JobCard
            key={job.applicationId}
            job={job}
            onGenerate={handleGenerate}
            onStatusChange={handleStatusChange}
          />
        ))
      )}
    </section>
  );
}
