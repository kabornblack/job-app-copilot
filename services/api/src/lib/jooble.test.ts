import { afterEach, describe, expect, it, vi } from "vitest";
import { computeJobFingerprint } from "./job-fingerprint";
import {
  isUntrustedUsStateResolution,
  parseJoobleResult,
  parseJoobleSalary,
  searchJooble,
} from "./jooble";

describe("parseJoobleResult", () => {
  it("maps Jooble fields to job schema shape, and no longer reads type into remoteType", () => {
    const job = parseJoobleResult({
      id: 1234567890,
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      location: "Tallinn, Estonia",
      // type is employment type (Full-time/Part-time/Temporary), not
      // remote status - must have zero effect on remoteType now.
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
    // Neither location nor snippet has remote/hybrid signal, so this must
    // be null now, not the old "Full-time" employment-type value.
    expect(job.remoteType).toBeNull();
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

  it("derives remoteType from location text (real sample shape: location is literally 'Remote')", () => {
    const job = parseJoobleResult({
      id: 999,
      title: "Full Stack Developer - AI",
      company: "FEI Systems",
      location: "Remote",
      type: "Full-time",
      link: "https://jooble.org/desc/999",
    });
    expect(job.remoteType).toBe("remote");
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

describe("isUntrustedUsStateResolution", () => {
  it("flags a bare city name resolved to an unrequested US state (the real Kentucky bug)", () => {
    expect(isUntrustedUsStateResolution("London, KY", "London")).toBe(true);
    expect(isUntrustedUsStateResolution("Public, KY", "London")).toBe(true);
  });

  it("does not flag a correctly-scoped request", () => {
    expect(isUntrustedUsStateResolution("United Kingdom", "London, UK")).toBe(false);
    expect(isUntrustedUsStateResolution(null, "London")).toBe(false);
    expect(isUntrustedUsStateResolution("Remote", "London")).toBe(false);
  });

  it("does not flag a genuine US search that explicitly asked for that state", () => {
    expect(isUntrustedUsStateResolution("Austin, TX", "Austin, TX")).toBe(false);
  });

  it("does not flag a genuine US search using 'USA'/'United States' instead of a state code", () => {
    expect(isUntrustedUsStateResolution("Austin, TX", "Austin, USA")).toBe(false);
    expect(
      isUntrustedUsStateResolution("Austin, TX", "Austin, United States"),
    ).toBe(false);
  });

  it("ignores a two-letter suffix that isn't a real US state abbreviation", () => {
    expect(isUntrustedUsStateResolution("Some City, ZZ", "London")).toBe(false);
  });
});

describe("searchJooble", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.JOOBLE_API_KEY;
  });

  it("corrects an untrusted US-state resolution end-to-end, nulling location and re-deriving remoteType", async () => {
    process.env.JOOBLE_API_KEY = "test-key";
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 1,
              title: "General Manager",
              company: "Some Retailer",
              location: "London, KY",
              type: "Full-time",
              snippet: "Retail management role.",
              link: "https://jooble.org/desc/1",
            },
            {
              id: 2,
              title: "Frontend Engineer",
              company: "Real UK Co",
              location: "London, UK",
              type: "Full-time",
              snippet: "Real UK-scoped result, must be left untouched.",
              link: "https://jooble.org/desc/2",
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await searchJooble({
      skills: [],
      targetRoles: ["Frontend engineer"],
      locations: ["London"],
      remotePref: "any",
    });

    const [kentucky, uk] = result.jobs;
    expect(kentucky.title).toBe("General Manager");
    expect(kentucky.location).toBeNull();
    expect(kentucky.remoteType).toBeNull();

    expect(uk.title).toBe("Frontend Engineer");
    expect(uk.location).toBe("London, UK");
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
