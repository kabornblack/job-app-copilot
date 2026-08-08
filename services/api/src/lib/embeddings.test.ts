import { describe, expect, it } from "vitest";
import {
  buildJobEmbeddingText,
  buildProfileEmbeddingText,
} from "./embeddings";

describe("embedding text builders", () => {
  it("builds profile text from summary, skills, and roles", () => {
    const text = buildProfileEmbeddingText({
      resumeSummary: "Full-stack engineer in Tallinn.",
      skills: ["TypeScript", "React"],
      targetRoles: ["Frontend Engineer"],
    });

    expect(text).toContain("Full-stack engineer in Tallinn.");
    expect(text).toContain("Skills: TypeScript, React");
    expect(text).toContain("Target roles: Frontend Engineer");
  });

  it("builds job text from title and truncated description", () => {
    const longDescription = "x".repeat(9000);
    const text = buildJobEmbeddingText({
      title: "Frontend Engineer",
      description: longDescription,
    });

    expect(text.startsWith("Frontend Engineer\n")).toBe(true);
    expect(text.length).toBeLessThan(9000);
  });
});
