import { describe, expect, it } from "vitest";
import { deriveAdzunaCountry, parseAdzunaResult } from "./adzuna";
import { computeJobFingerprint } from "./job-fingerprint";

describe("parseAdzunaResult", () => {
  it("maps Adzuna fields to job schema", () => {
    const result = {
      id: "123",
      title: "Senior Backend Engineer",
      company: { display_name: "Acme Corp" },
      location: { display_name: "Tallinn, Estonia" },
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
    expect(job.remoteType).toBe("remote");
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

  it("derives supported Adzuna countries and fallbacks", () => {
    expect(deriveAdzunaCountry(["Tallinn, Estonia"]).country).toBe("gb");
    expect(deriveAdzunaCountry(["Tallinn, Estonia"]).keepWhere).toBe(false);
    expect(deriveAdzunaCountry(["Berlin, Germany"]).country).toBe("de");
    expect(deriveAdzunaCountry(["Berlin, Germany"]).keepWhere).toBe(true);
    expect(deriveAdzunaCountry(["Toronto, Canada"]).country).toBe("ca");
    expect(deriveAdzunaCountry(["Toronto, Canada"]).keepWhere).toBe(true);
  });
});
