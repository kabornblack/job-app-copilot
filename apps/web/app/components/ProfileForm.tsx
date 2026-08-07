"use client";
import { useState } from "react";

type ProfileFormProps = {
  apiUrl: string;
  onSearchComplete: () => void;
};

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
  const [submitting, setSubmitting] = useState(false);

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

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
      const response = await fetch(`${apiUrl}/jobs/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });

      if (!response.ok) {
        const error = await response.text();
        setStatus(`Search failed: ${error}`);
        return;
      }

      const result = await response.json();
      setStatus(
        `${result.results.length} jobs found and added to review queue.`,
      );
      onSearchComplete();
    } catch (error) {
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
      {status ? <p style={{ marginTop: "1rem" }}>{status}</p> : null}
    </section>
  );
}
