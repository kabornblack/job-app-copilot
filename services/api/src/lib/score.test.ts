import { describe, expect, it } from "vitest";
import { scoreProfileJob } from "./score";

describe("scoreProfileJob", () => {
  it("scores based on skill and role overlap", () => {
    const profile = {
      skills: ["TypeScript", "React", "SQL"],
      targetRoles: ["Frontend Engineer"],
      locations: ["Tallinn"],
      remotePref: "remote" as const,
    };

    const job = {
      title: "Frontend Engineer",
      description:
        "Build React applications with TypeScript and SQL-backed APIs.",
      company: "Example Co",
      location: "Tallinn, Estonia",
      remoteType: "remote",
    };

    const result = scoreProfileJob(profile, job);

    expect(result.score).toBeGreaterThan(5);
    expect(result.explanation).toContain("skill");
    expect(result.explanation).toContain("role keyword");
    expect(result.explanation).toContain("Remote preference fits");
  });
});
