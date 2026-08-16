import { describe, expect, it } from "vitest";
import { buildPrompt, type ClaudeJobContext, type ClaudeProfileContext } from "./claude";
import type { ProfileKnowledgeBundle } from "./profile-serialization";

const job: ClaudeJobContext = {
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  location: "Berlin, Germany",
  remoteType: "hybrid",
  description: "Build and ship product features.",
  url: "https://example.com/job/1",
  postedAt: "2026-01-01T00:00:00.000Z",
};

const profile: ClaudeProfileContext = {
  skills: ["TypeScript", "React"],
  targetRoles: ["Frontend Engineer"],
  locations: ["Berlin", "Remote"],
  remotePref: "hybrid",
  resumeSummary: "Frontend engineer with 5 years of experience.",
};

const emptyKnowledge: ProfileKnowledgeBundle = {
  personalDetails: null,
  workExperience: [],
  education: [],
  certifications: [],
  achievements: [],
  skills: [],
};

describe("buildPrompt", () => {
  it("CV-absent path: uses the structured serialization as the sole fact source, never mentions an uploaded CV", () => {
    const prompt = buildPrompt(job, profile, "cv", emptyKnowledge, null);
    expect(prompt).toContain("Candidate background:");
    expect(prompt).toContain(
      "Every fact (dates, employers, titles, achievements) must come from the candidate background section",
    );
    expect(prompt).not.toContain("UPLOADED CV");
    expect(prompt).not.toContain("PROFILE DATA (gap-filling only)");
  });

  it("CV-present path: states the explicit priority rule and includes both sources, CV first", () => {
    const cvText = "Jane Doe\nSenior Engineer at RealCo, 2019 - Present";
    const prompt = buildPrompt(job, profile, "cv", emptyKnowledge, cvText);

    expect(prompt).toContain("UPLOADED CV (authoritative)");
    expect(prompt).toContain("PROFILE DATA (gap-filling only)");
    expect(prompt).toContain(
      "If profile data conflicts with the\n   uploaded CV in any way, the uploaded CV always wins",
    );
    expect(prompt).toContain(cvText);
    // CV section must appear before the profile-data section, matching the
    // documented priority ordering.
    expect(prompt.indexOf("UPLOADED CV")).toBeLessThan(
      prompt.indexOf("PROFILE DATA (gap-filling only)"),
    );
  });

  it("includes the job context and search-preference fields in both paths", () => {
    for (const cvText of [null, "some real CV text"]) {
      const prompt = buildPrompt(job, profile, "cv", emptyKnowledge, cvText);
      expect(prompt).toContain("Senior Frontend Engineer");
      expect(prompt).toContain("Acme Corp");
      expect(prompt).toContain("Target roles: Frontend Engineer");
      expect(prompt).toContain("Remote preference: hybrid");
    }
  });

  it("cover_letter type produces a cover-letter-labeled prompt in both paths", () => {
    const absent = buildPrompt(job, profile, "cover_letter", emptyKnowledge, null);
    const present = buildPrompt(job, profile, "cover_letter", emptyKnowledge, "cv text");
    expect(absent).toContain("cover letter draft");
    expect(present).toContain("cover letter draft");
    expect(absent).not.toContain("CV/resume");
    expect(present).not.toContain("CV/resume");
  });
});
