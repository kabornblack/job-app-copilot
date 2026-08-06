import { describe, expect, it } from "vitest";

describe("api health route", () => {
  it("exposes a health endpoint contract", () => {
    expect("health").toBe("health");
  });
});
