import { describe, expect, it } from "vitest";
import { deriveAdzunaCountry, parseAdzunaResult } from "./adzuna";
import { computeJobFingerprint } from "./job-fingerprint";

describe("parseAdzunaResult", () => {
  it("maps Adzuna fields to job schema, and no longer reads contract_type into remoteType", () => {
    const result = {
      id: "123",
      title: "Senior Backend Engineer",
      company: { display_name: "Acme Corp" },
      location: { display_name: "Tallinn, Estonia" },
      // contract_type is employment type (permanent/contract), not remote
      // status. Deliberately set to the string "remote" here - if this were
      // still being read into remoteType (the old, wrong behavior), this
      // test would pass for the wrong reason. It must have zero effect now.
      contract_type: "remote",
      salary_min: 4000,
      salary_max: 6000,
      description: "Build scalable APIs.",
      redirect_url: "https://adzuna.example/job/123",
      created: "2026-08-06T12:00:00Z",
    };

    const job = parseAdzunaResult(result);

    expect(job.source).toBe("adzuna");
    expect(job.externalId).toBe("123");
    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.company).toBe("Acme Corp");
    expect(job.location).toBe("Tallinn, Estonia");
    // Neither location nor description has any remote/hybrid signal, so
    // this must be null - proving contract_type's "remote" value above was
    // genuinely ignored, not coincidentally matched.
    expect(job.remoteType).toBeNull();
    expect(job.salaryMin).toBe(4000);
    expect(job.salaryMax).toBe(6000);
    expect(job.description).toBe("Build scalable APIs.");
    expect(job.url).toBe("https://adzuna.example/job/123");
    expect(job.postedAt).toBe("2026-08-06T12:00:00Z");
    expect(job.fingerprint).toBe(
      computeJobFingerprint({
        title: "Senior Backend Engineer",
        company: "Acme Corp",
        location: "Tallinn, Estonia",
      }),
    );
  });

  it("derives remoteType from location/description text (deriveRemoteType wired in correctly)", () => {
    const remoteResult = {
      id: "124",
      title: "Frontend Engineer",
      company: { display_name: "Acme Corp" },
      location: { display_name: "Remote" },
      contract_type: "permanent",
      redirect_url: "https://adzuna.example/job/124",
    };
    expect(parseAdzunaResult(remoteResult).remoteType).toBe("remote");

    const hybridResult = {
      id: "125",
      title: "Platform Engineer",
      company: { display_name: "Acme Corp" },
      location: { display_name: "London, UK" },
      contract_type: "contract",
      description: "Logistics: Hybrid - 2 days in office per week.",
      redirect_url: "https://adzuna.example/job/125",
    };
    expect(parseAdzunaResult(hybridResult).remoteType).toBe("hybrid");
  });

  it("derives supported Adzuna countries and fallbacks", () => {
    expect(deriveAdzunaCountry(["Tallinn, Estonia"]).country).toBe("gb");
    expect(deriveAdzunaCountry(["Tallinn, Estonia"]).keepWhere).toBe(false);
    expect(deriveAdzunaCountry(["Berlin, Germany"]).country).toBe("de");
    expect(deriveAdzunaCountry(["Berlin, Germany"]).keepWhere).toBe(true);
    expect(deriveAdzunaCountry(["Toronto, Canada"]).country).toBe("ca");
    expect(deriveAdzunaCountry(["Toronto, Canada"]).keepWhere).toBe(true);
  });
});
