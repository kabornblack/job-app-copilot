import { describe, expect, it } from "vitest";

describe("home page", () => {
  it("renders the app title", () => {
    expect("Job Application Copilot").toContain("Job Application Copilot");
  });
});
