import { describe, expect, it } from "vitest";
import { evaluateLocationGate } from "./location-gate";

const candidateLocations = ["Tallinn", "remote"];

describe("evaluateLocationGate", () => {
  it("passes a fully remote job regardless of location", () => {
    const result = evaluateLocationGate(
      { location: "London, UK", remoteType: "remote" },
      candidateLocations,
    );
    expect(result).toEqual({ passes: true, reason: "remote" });
  });

  it("passes a hybrid job when the location matches the candidate", () => {
    const result = evaluateLocationGate(
      { location: "Tallinn, Estonia", remoteType: "hybrid" },
      candidateLocations,
    );
    expect(result).toEqual({ passes: true, reason: "hybrid-location-match" });
  });

  it("gates a hybrid job when the location does not match - hybrid still requires physical presence", () => {
    const result = evaluateLocationGate(
      { location: "London, UK", remoteType: "hybrid" },
      candidateLocations,
    );
    expect(result).toEqual({
      passes: false,
      reason: "hybrid-location-mismatch",
    });
  });

  it("passes a job with no remote signal when its location directly matches the candidate", () => {
    const result = evaluateLocationGate(
      { location: "Tallinn, Estonia", remoteType: null },
      candidateLocations,
    );
    expect(result).toEqual({ passes: true, reason: "location-match" });
  });

  it("gates a job with no remote signal and no location match - the exact bug this whole change fixes (72/Strong Match London job for a Tallinn candidate)", () => {
    const result = evaluateLocationGate(
      { location: "London, UK", remoteType: null },
      candidateLocations,
    );
    expect(result).toEqual({
      passes: false,
      reason: "no-signal-location-mismatch",
    });
  });

  it("gates a job with no location at all and no remote signal", () => {
    const result = evaluateLocationGate(
      { location: null, remoteType: null },
      candidateLocations,
    );
    expect(result.passes).toBe(false);
  });

  it("location matching is case-insensitive and substring-based", () => {
    const result = evaluateLocationGate(
      { location: "TALLINN, ESTONIA", remoteType: null },
      candidateLocations,
    );
    expect(result.passes).toBe(true);
  });

  it("ignores blank/empty candidate location tokens rather than matching everything", () => {
    const result = evaluateLocationGate(
      { location: "London, UK", remoteType: null },
      ["", "  "],
    );
    expect(result.passes).toBe(false);
  });
});
