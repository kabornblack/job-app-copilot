"use client";
import { useState } from "react";
import { apiFetch } from "../../lib/api";

type ProfileFormProps = {
  apiUrl: string;
  onSearchComplete: () => void;
};

type SearchRunResponse = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stats?: {
    jobsSeen?: number;
    matchesCreated?: number;
    matchesReused?: number;
    applicationsCreated?: number;
    claudeCalls?: number;
    scoreJobsEnqueued?: number;
    scoreJobsFinished?: number;
  };
  error?: string | null;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export default function ProfileForm({
  apiUrl,
  onSearchComplete,
}: ProfileFormProps) {
  const [skills, setSkills] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [remotePref, setRemotePref] = useState("any");
  const [resumeSummary, setResumeSummary] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"info" | "error" | "success">(
    "info",
  );
  const [submitting, setSubmitting] = useState(false);

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const formatRunProgress = (run: SearchRunResponse) => {
    const stats = run.stats ?? {};
    const finished = stats.scoreJobsFinished ?? 0;
    const enqueued = stats.scoreJobsEnqueued ?? 0;
    if (run.status === "queued") {
      return "Search queued…";
    }
    if (enqueued > 0) {
      return `Searching… scoring ${finished}/${enqueued} jobs (seen ${stats.jobsSeen ?? 0})`;
    }
    return "Searching… fetching jobs";
  };

  const pollSearchRun = async (runId: string): Promise<SearchRunResponse> => {
    for (;;) {
      const response = await apiFetch(`/search-runs/${runId}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to load search run status");
      }
      const run = (await response.json()) as SearchRunResponse;
      if (run.status === "completed" || run.status === "failed") {
        return run;
      }
      setStatusTone("info");
      setStatus(formatRunProgress(run));
      await sleep(1500);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusTone("info");
    setStatus("Searching…");

    const profile = {
      skills: parseList(skills),
      targetRoles: parseList(targetRoles),
      locations: parseList(locations),
      salaryMin: salaryMin ? Number(salaryMin) : undefined,
      salaryMax: salaryMax ? Number(salaryMax) : undefined,
      currency: "EUR",
      remotePref: remotePref as "remote" | "hybrid" | "onsite" | "any",
      resumeSummary: resumeSummary || undefined,
    };

    try {
      const response = await apiFetch(`/jobs/search`, {
        method: "POST",
        body: JSON.stringify({ profile }),
      });

      if (response.status !== 202) {
        const error = await response.text();
        setStatusTone("error");
        setStatus(`Search failed: ${error}`);
        return;
      }

      const started = await response.json();
      setStatus("Search queued…");
      const run = await pollSearchRun(started.runId);

      if (run.status === "failed") {
        setStatusTone("error");
        setStatus(`Search failed: ${run.error ?? "Unknown error"}`);
        return;
      }

      const stats = run.stats ?? {};
      setStatusTone("success");
      setStatus(
        `Search complete — ${stats.jobsSeen ?? 0} jobs seen, ${stats.matchesCreated ?? 0} new matches, ${stats.matchesReused ?? 0} reused. Review queue updated.`,
      );
      onSearchComplete();
    } catch (error) {
      setStatusTone("error");
      setStatus(`Search failed: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2>Profile input</h2>
      <form
        onSubmit={handleSubmit}
        style={{ display: "grid", gap: "0.75rem", maxWidth: 650 }}
      >
        <label>
          Skills (comma separated)
          <input
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="React, TypeScript, SQL"
            required
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Target roles
          <input
            value={targetRoles}
            onChange={(event) => setTargetRoles(event.target.value)}
            placeholder="Frontend Engineer, Full-stack Developer"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Locations
          <input
            value={locations}
            onChange={(event) => setLocations(event.target.value)}
            placeholder="Tallinn, remote"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <label>
            Salary min
            <input
              type="number"
              value={salaryMin}
              onChange={(event) => setSalaryMin(event.target.value)}
              placeholder="3000"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            Salary max
            <input
              type="number"
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
              placeholder="5000"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </label>
        </div>
        <label>
          Remote preference
          <select
            value={remotePref}
            onChange={(event) => setRemotePref(event.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            <option value="any">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        <label>
          Resume summary
          <textarea
            value={resumeSummary}
            onChange={(event) => setResumeSummary(event.target.value)}
            placeholder="Experienced full-stack engineer with strong React and Node.js skills."
            rows={4}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          style={{ padding: "0.75rem 1rem", width: 200 }}
        >
          {submitting ? "Searching..." : "Search jobs"}
        </button>
      </form>
      {status ? (
        <p
          style={{
            marginTop: "1rem",
            color:
              statusTone === "error"
                ? "#a40"
                : statusTone === "success"
                  ? "#276749"
                  : "#1a202c",
          }}
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}
