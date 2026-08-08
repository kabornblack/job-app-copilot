import { describe, expect, it } from "vitest";
import {
  computeJobFingerprint,
  normalizeJobFingerprintPart,
} from "./job-fingerprint";

describe("normalizeJobFingerprintPart", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeJobFingerprintPart("  Senior   Engineer ")).toBe(
      "senior engineer",
    );
  });

  it("treats null/undefined as empty", () => {
    expect(normalizeJobFingerprintPart(null)).toBe("");
    expect(normalizeJobFingerprintPart(undefined)).toBe("");
  });
});

describe("computeJobFingerprint", () => {
  it("is stable across casing and spacing", () => {
    const a = computeJobFingerprint({
      title: "Senior Engineer",
      company: "Acme Corp",
      location: "Tallinn, Estonia",
    });
    const b = computeJobFingerprint({
      title: "  senior   engineer ",
      company: "ACME CORP",
      location: "tallinn, estonia",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("matches across sources when title/company/location match", () => {
    const fields = {
      title: "Backend Engineer",
      company: "Example Oy",
      location: "Helsinki",
    };
    expect(computeJobFingerprint(fields)).toBe(
      computeJobFingerprint(fields),
    );
  });

  it("differs when company differs", () => {
    const base = {
      title: "Backend Engineer",
      company: "Example Oy",
      location: "Helsinki",
    };
    expect(computeJobFingerprint(base)).not.toBe(
      computeJobFingerprint({ ...base, company: "Other Oy" }),
    );
  });

  it("does not depend on external id (callers must omit it)", () => {
    // Documented contract: only title/company/location enter the hash.
    const fp = computeJobFingerprint({
      title: "Role",
      company: "Co",
      location: "City",
    });
    expect(fp).toBe(
      computeJobFingerprint({
        title: "Role",
        company: "Co",
        location: "City",
      }),
    );
  });
});
