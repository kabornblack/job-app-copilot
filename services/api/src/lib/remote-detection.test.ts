import { describe, expect, it } from "vitest";
import { deriveRemoteType } from "./remote-detection";

describe("deriveRemoteType", () => {
  it("returns 'remote' when location literally says Remote (real Jooble sample)", () => {
    expect(
      deriveRemoteType({
        location: "Remote",
        description: "FEI Systems, we create innovative technology solutions...",
      }),
    ).toBe("remote");
  });

  it("returns 'hybrid' from description text even when location is unrelated (real Adzuna sample)", () => {
    // Real sample: "Fullstack Software Engineer (TypeScript, C#, AWS) 12
    // month Maternity Cover", location "London, UK", description mentions
    // "Logistics: Hybrid - 2 [days]..." - remote_type used to say
    // "contract" (employment type), which said nothing about this.
    expect(
      deriveRemoteType({
        location: "London, UK",
        description: "Maternity Leave Cover - Fixed Term Employee for 12 months Logistics: Hybrid - 2 days in office per week.",
      }),
    ).toBe("hybrid");
  });

  it("returns null (not remote) when the text explicitly negates it, even if 'remote' also appears", () => {
    expect(
      deriveRemoteType({
        location: "London, UK",
        description: "This is not a remote position - must be on-site 5 days a week.",
      }),
    ).toBeNull();
  });

  it("returns null when there is genuinely no signal (the common case today)", () => {
    expect(
      deriveRemoteType({
        location: "Leeds, West Yorkshire",
        description: "What if the skills you've built in data entry could help bring new medicines to patients.",
      }),
    ).toBeNull();
  });

  it("returns null for both fields empty/null", () => {
    expect(deriveRemoteType({ location: null, description: null })).toBeNull();
  });

  it("prefers location-based 'remote' over a description-based hybrid mention", () => {
    expect(
      deriveRemoteType({
        location: "Remote",
        description: "Some teams work hybrid, but this role is fully remote.",
      }),
    ).toBe("remote");
  });

  it("recognizes alternate remote phrasings (work from home, wfh, fully remote, 100% remote)", () => {
    expect(deriveRemoteType({ location: null, description: "Work from home role." })).toBe("remote");
    expect(deriveRemoteType({ location: null, description: "WFH available." })).toBe("remote");
    expect(deriveRemoteType({ location: null, description: "This is a fully remote team." })).toBe("remote");
    expect(deriveRemoteType({ location: null, description: "100% remote position." })).toBe("remote");
  });

  it("is case-insensitive", () => {
    expect(deriveRemoteType({ location: "REMOTE", description: null })).toBe("remote");
    expect(deriveRemoteType({ location: null, description: "HYBRID role" })).toBe("hybrid");
  });
});
