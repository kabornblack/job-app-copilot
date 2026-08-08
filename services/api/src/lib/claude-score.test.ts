import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseClaudeScoreToolInput,
  scoreJobMatchWithClaude,
} from "./claude-score";

const profile = {
  skills: ["TypeScript"],
  targetRoles: ["Engineer"],
  locations: ["Tallinn"],
  remotePref: "hybrid" as const,
  resumeSummary: "Builder",
};

const job = {
  title: "Engineer",
  company: "Acme",
  location: "Tallinn",
  remoteType: "hybrid",
  url: "https://example.com/jobs/1",
  postedAt: null,
  description: "TypeScript role",
};

describe("parseClaudeScoreToolInput", () => {
  it("accepts a valid 0-100 score payload", () => {
    expect(
      parseClaudeScoreToolInput({
        score: 72,
        explanation: "Strong React overlap with a senior-leaning title gap.",
      }),
    ).toEqual({
      score: 72,
      explanation: "Strong React overlap with a senior-leaning title gap.",
    });
  });

  it("rejects scores outside 0-100", () => {
    expect(() =>
      parseClaudeScoreToolInput({
        score: 140,
        explanation: "Too high",
      }),
    ).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => parseClaudeScoreToolInput(null)).toThrow();
    expect(() => parseClaudeScoreToolInput("nope")).toThrow();
  });

  it("rejects missing explanation", () => {
    expect(() => parseClaudeScoreToolInput({ score: 50 })).toThrow();
  });

  it("rejects empty explanation", () => {
    expect(() =>
      parseClaudeScoreToolInput({ score: 50, explanation: "" }),
    ).toThrow();
  });

  it("rejects float scores", () => {
    expect(() =>
      parseClaudeScoreToolInput({
        score: 72.5,
        explanation: "Not an integer",
      }),
    ).toThrow();
  });

  it("rejects score as string without coercion", () => {
    expect(() =>
      parseClaudeScoreToolInput({
        score: "80",
        explanation: "String score must not pass",
      }),
    ).toThrow();
  });
});

describe("scoreJobMatchWithClaude tool_use contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws when response has no score_job_match tool_use block", async () => {
    process.env.CLAUDE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: "I refuse to use tools" }],
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(scoreJobMatchWithClaude(job, profile)).rejects.toThrow(
      /score_job_match/,
    );
  });
});
