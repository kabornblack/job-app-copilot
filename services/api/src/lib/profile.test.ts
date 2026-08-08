import { describe, expect, it } from "vitest";
import { profileDataEquals } from "./profile";

describe("profileDataEquals", () => {
  const base = {
    skills: ["React", "TypeScript"],
    targetRoles: ["Software Engineer"],
    locations: ["London"],
    salaryMin: 4000,
    salaryMax: 6000,
    currency: "EUR",
    remotePref: "any" as const,
    resumeSummary: "Full-stack engineer.",
  };

  it("treats reordered skills as equal", () => {
    expect(
      profileDataEquals(base, {
        ...base,
        skills: ["TypeScript", "React"],
      }),
    ).toBe(true);
  });

  it("detects changed resume summary", () => {
    expect(
      profileDataEquals(base, {
        ...base,
        resumeSummary: "Different summary.",
      }),
    ).toBe(false);
  });
});
