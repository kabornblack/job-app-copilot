import { describe, expect, it } from "vitest";
import {
  serializeProfileKnowledge,
  type ProfileKnowledgeBundle,
} from "./profile-serialization";

const now = new Date("2026-01-01T00:00:00Z");

const emptyBundle: ProfileKnowledgeBundle = {
  personalDetails: null,
  workExperience: [],
  education: [],
  certifications: [],
  achievements: [],
  skills: [],
};

const fullBundle: ProfileKnowledgeBundle = {
  personalDetails: {
    userId: "u1",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+372 5555 5555",
    location: "Tallinn, Estonia",
    linkedinUrl: "linkedin.com/in/janedoe",
    portfolioUrl: "janedoe.dev",
    professionalSummary: "Full-stack engineer.",
    createdAt: now,
    updatedAt: now,
  },
  workExperience: [
    {
      id: "w1",
      userId: "u1",
      company: "StartupCo",
      title: "Frontend Engineer",
      location: "Remote",
      startMonth: 1,
      startYear: 2018,
      endMonth: 2,
      endYear: 2020,
      bullets: ["Built and shipped core features end-to-end"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "w2",
      userId: "u1",
      company: "Acme Corp",
      title: "Senior Frontend Engineer",
      location: "Tallinn, Estonia",
      startMonth: 3,
      startYear: 2020,
      endMonth: null,
      endYear: null,
      bullets: ["Led migration to React/TypeScript", "Mentored 3 juniors"],
      createdAt: now,
      updatedAt: now,
    },
  ],
  education: [
    {
      id: "e1",
      userId: "u1",
      institution: "Tallinn University of Technology",
      degree: "BSc Computer Science",
      fieldOfStudy: null,
      startMonth: 9,
      startYear: 2014,
      endMonth: 6,
      endYear: 2018,
      description: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  certifications: [
    {
      id: "c1",
      userId: "u1",
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      issueMonth: 6,
      issueYear: 2022,
      expirationMonth: null,
      expirationYear: null,
      credentialId: null,
      credentialUrl: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  achievements: [
    {
      id: "a1",
      userId: "u1",
      title: "Speaker at ReactConf 2023",
      description: "Scaling React apps at startups",
      month: 6,
      year: 2023,
      createdAt: now,
      updatedAt: now,
    },
  ],
  skills: [
    { id: "s1", userId: "u1", name: "TypeScript", category: "Languages", createdAt: now, updatedAt: now },
    { id: "s2", userId: "u1", name: "React", category: "Frameworks", createdAt: now, updatedAt: now },
    { id: "s3", userId: "u1", name: "Communication", category: null, createdAt: now, updatedAt: now },
  ],
};

describe("serializeProfileKnowledge", () => {
  it("returns a placeholder string when every resource is empty", () => {
    expect(serializeProfileKnowledge(emptyBundle)).toBe(
      "No structured profile data on file.",
    );
  });

  it("formats work experience most-recent-first with dates and bullets", () => {
    const text = serializeProfileKnowledge(fullBundle);
    const workSection = text.split("\n\n").find((s) => s.startsWith("WORK EXPERIENCE"));
    expect(workSection).toBeDefined();
    // Most recent (Acme Corp, still current) must appear before StartupCo.
    expect(workSection!.indexOf("Acme Corp")).toBeLessThan(
      workSection!.indexOf("StartupCo"),
    );
    expect(workSection).toContain("Mar 2020 - Present");
    expect(workSection).toContain("Jan 2018 - Feb 2020");
    expect(workSection).toContain("Led migration to React/TypeScript");
  });

  it("groups skills by category and lists uncategorized skills separately", () => {
    const text = serializeProfileKnowledge(fullBundle);
    const skillsSection = text.split("\n\n").find((s) => s.startsWith("SKILLS"));
    expect(skillsSection).toContain("Languages: TypeScript");
    expect(skillsSection).toContain("Frameworks: React");
    expect(skillsSection).toContain("- Communication");
  });

  it("labels the professional summary as framing/tone only, not a fact", () => {
    const text = serializeProfileKnowledge(fullBundle, "Looking for remote roles.");
    expect(text).toContain(
      "PROFESSIONAL SUMMARY (framing/tone only, not a fact source):\nLooking for remote roles.",
    );
  });

  it("omits the summary section entirely when no summary is passed", () => {
    const text = serializeProfileKnowledge(fullBundle, null);
    expect(text).not.toContain("PROFESSIONAL SUMMARY");
  });

  it("formats certifications with issued/expiration dates when present", () => {
    const text = serializeProfileKnowledge(fullBundle);
    expect(text).toContain(
      "- AWS Certified Solutions Architect, Amazon Web Services (Issued Jun 2022)",
    );
  });

  it("formats achievements with a date and description", () => {
    const text = serializeProfileKnowledge(fullBundle);
    expect(text).toContain(
      "- Speaker at ReactConf 2023 (Jun 2023): Scaling React apps at startups",
    );
  });
});
