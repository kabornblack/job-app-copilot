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

  it("cover_letter gets its own narrative-letter format instruction, not the CV path's resume-style-sections instruction", () => {
    for (const cvText of [null, "some real CV text"]) {
      const prompt = buildPrompt(job, profile, "cover_letter", emptyKnowledge, cvText);
      // The bug this test guards against: both types used to share one
      // closing line telling the model to use "resume-style sections such
      // as Summary, Skills, and Experience" - which made cover letters
      // come out resume-shaped. That instruction must never appear for
      // cover_letter.
      expect(prompt).not.toContain("resume-style sections");
      expect(prompt).not.toContain("Summary, Skills, and Experience");
      // The new distinct instruction must be present instead.
      expect(prompt).toContain("Write this as an actual cover letter, not a resume");
      expect(prompt).toContain("NO section headers of any kind");
      expect(prompt).toContain('do not write "Cover Letter" as a heading');
      expect(prompt).toContain("250-350 words");
      expect(prompt).toContain("do not use bullet points");
    }
  });

  it("the cv type still gets the original resume-style-sections instruction, unaffected by the cover-letter fix", () => {
    for (const cvText of [null, "some real CV text"]) {
      const prompt = buildPrompt(job, profile, "cv", emptyKnowledge, cvText);
      expect(prompt).toContain(
        "using resume-style sections such as Summary, Skills, and Experience",
      );
      expect(prompt).not.toContain("Write this as an actual cover letter");
    }
  });
});
