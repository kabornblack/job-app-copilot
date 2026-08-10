import { describe, expect, it } from "vitest";
import { validatePassword } from "./password";

describe("validatePassword", () => {
  it("rejects short passwords as weak", () => {
    const result = validatePassword("Ab1");
    expect(result.ok).toBe(false);
    expect(result.strength).toBe("weak");
    expect(result.errors).toContain("At least 8 characters");
  });

  it("requires upper, lower, and number", () => {
    expect(validatePassword("abcdefgh").ok).toBe(false);
    expect(validatePassword("ABCDEFGH").ok).toBe(false);
    expect(validatePassword("abcdEFGH").ok).toBe(false);
    expect(validatePassword("abcd1234").ok).toBe(false);
  });

  it("accepts medium when rules met and length < 12", () => {
    const result = validatePassword("Abcd1234");
    expect(result.ok).toBe(true);
    expect(result.strength).toBe("medium");
    expect(result.errors).toEqual([]);
  });

  it("marks strong at length >= 12 when rules met", () => {
    const result = validatePassword("Abcd1234Wxyz");
    expect(result.ok).toBe(true);
    expect(result.strength).toBe("strong");
  });

  it("does not require special characters", () => {
    expect(validatePassword("Password1").ok).toBe(true);
  });
});
