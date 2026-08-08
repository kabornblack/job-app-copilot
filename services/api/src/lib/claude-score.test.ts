import { describe, expect, it } from "vitest";
import { parseClaudeScoreToolInput } from "./claude-score";

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
});
