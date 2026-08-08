import { describe, expect, it } from "vitest";
import { computeJobFingerprint } from "./job-fingerprint";
import { parseJoobleResult, parseJoobleSalary } from "./jooble";

describe("parseJoobleResult", () => {
  it("maps Jooble fields to job schema shape", () => {
    const job = parseJoobleResult({
      id: 1234567890,
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      location: "Tallinn, Estonia",
      type: "Full-time",
      salary: "4000 - 6000 EUR",
      snippet: "Build scalable APIs.",
      link: "https://ee.jooble.org/jdp/1234567890",
      updated: "2026-08-06T12:00:00Z",
    });

    expect(job.source).toBe("jooble");
    expect(job.externalId).toBe("1234567890");
    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.company).toBe("Acme Corp");
    expect(job.location).toBe("Tallinn, Estonia");
    expect(job.remoteType).toBe("Full-time");
    expect(job.salaryMin).toBe(4000);
    expect(job.salaryMax).toBe(6000);
    expect(job.description).toBe("Build scalable APIs.");
    expect(job.url).toBe("https://ee.jooble.org/jdp/1234567890");
    expect(job.postedAt).toBe("2026-08-06T12:00:00Z");
    expect(job.fingerprint).toBe(
      computeJobFingerprint({
        title: "Senior Backend Engineer",
        company: "Acme Corp",
        location: "Tallinn, Estonia",
      }),
    );
  });

  it("matches Adzuna fingerprint for same title/company/location", () => {
    const fields = {
      title: "Frontend Engineer",
      company: "Example Oy",
      location: "Helsinki",
    };
    const jooble = parseJoobleResult({
      id: "jooble-1",
      ...fields,
      link: "https://jooble.example/1",
    });
    expect(jooble.fingerprint).toBe(computeJobFingerprint(fields));
  });
});

describe("Jooble int64 id handling", () => {
  it("preserves large ids when quoting before JSON.parse", () => {
    const raw = `{"jobs":[{"id":-1138193703624024526,"title":"T","company":"C","link":"https://x"}]}`;
    const withStringIds = raw.replace(/"id"\s*:\s*(-?\d+)\s*/g, '"id":"$1"');
    const payload = JSON.parse(withStringIds) as {
      jobs: Array<{ id: string }>;
    };
    expect(payload.jobs[0].id).toBe("-1138193703624024526");
  });
});

describe("parseJoobleSalary", () => {
  it("parses ranges and single values", () => {
    expect(parseJoobleSalary("17,600 UAH")).toEqual({
      salaryMin: 17600,
      salaryMax: 17600,
    });
    expect(parseJoobleSalary("4000 - 6000 EUR")).toEqual({
      salaryMin: 4000,
      salaryMax: 6000,
    });
    expect(parseJoobleSalary(null)).toEqual({
      salaryMin: null,
      salaryMax: null,
    });
  });
});
