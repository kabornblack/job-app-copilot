import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./embeddings", async () => {
  const actual =
    await vi.importActual<typeof import("./embeddings")>("./embeddings");
  return {
    ...actual,
    generateEmbedding: vi.fn(async () => Array.from({ length: 1536 }, () => 0.01)),
  };
});

import { db } from "../db/client";
import { applications, jobs, matches, profiles } from "../db/schema";
import { ingestJobsForProfile } from "./job-search";

const userId = "00000000-0000-4000-8000-0000000000c4";
const unique = `location-gate-${Date.now()}`;
const originalFetch = global.fetch;

let profileId = "";

function adzunaResult(id: string, title: string, location: string, description: string) {
  return {
    id: `${unique}-adzuna-${id}`,
    title,
    company: { display_name: "Test Co" },
    location: { display_name: location },
    contract_type: "permanent", // employment type - must have no bearing on the gate
    description,
    redirect_url: `https://example.test/adzuna/${unique}-${id}`,
  };
}

function joobleResult(id: string, title: string, location: string, snippet: string) {
  return {
    id: `${unique}-jooble-${id}`,
    title,
    location,
    snippet,
    type: "Full-time", // employment type - must have no bearing on the gate
    link: `https://example.test/jooble/${unique}-${id}`,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(async () => {
  // Cleanup by external_id prefix - simpler than tracking every id.
  const testJobs = await db.select().from(jobs);
  for (const job of testJobs) {
    if (job.externalId.startsWith(unique)) {
      await db.delete(applications).where(eq(applications.jobId, job.id));
      await db.delete(matches).where(eq(matches.jobId, job.id));
      await db.delete(jobs).where(eq(jobs.id, job.id));
    }
  }
  if (profileId) {
    await db.delete(profiles).where(eq(profiles.id, profileId));
  }
});

describe("location gate wired into ingestJobsForProfile", () => {
  it("only pushes gate-passing jobs into jobIds, and counts the rest in jobsGatedByLocation", async () => {
    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        version: 1,
        skills: ["React", "TypeScript"],
        targetRoles: ["Frontend engineer", "full stack"],
        locations: ["Tallinn", "remote"],
        remotePref: "any",
      })
      .returning();
    profileId = profile.id;

    global.fetch = vi.fn(async (input: Request | string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("adzuna.com")) {
        return new Response(
          JSON.stringify({
            results: [
              // Passes: remoteType derives "remote" from location text.
              adzunaResult("remote-pass", "Remote Frontend Engineer", "Remote", "Great team, fully remote role."),
              // Passes: hybrid + location matches candidate's Tallinn.
              adzunaResult("hybrid-match-pass", "Hybrid Engineer Tallinn", "Tallinn, Estonia", "This is a hybrid role, 2 days in office."),
              // Gated: hybrid but location does not match.
              adzunaResult("hybrid-mismatch-gated", "Hybrid Engineer London", "London, UK", "This is a hybrid role, 3 days in office."),
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("jooble.org")) {
        return new Response(
          JSON.stringify({
            jobs: [
              // Gated: this is the exact real bug case - no remote signal,
              // location doesn't match, must not reach scoring regardless
              // of how good a skills match it might be.
              joobleResult("no-signal-mismatch-gated", "Full Stack Engineer, AI systems", "London, UK", "Great opportunity for a full stack engineer."),
              // Passes: no remote signal, but location directly matches.
              joobleResult("no-signal-match-pass", "Backend Engineer", "Tallinn, Estonia", "Looking for a backend engineer."),
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch in test to: ${url}`);
    }) as unknown as typeof fetch;

    const ingest = await ingestJobsForProfile(profile);

    expect(ingest.jobsSeen).toBe(5);
    expect(ingest.jobsGatedByLocation).toBe(2);
    expect(ingest.jobIds).toHaveLength(3);

    // Confirm exactly which ones passed/were gated, by title, not just counts.
    const allTestJobs = (await db.select().from(jobs)).filter((j) =>
      j.externalId.startsWith(unique),
    );
    const passedTitles = allTestJobs
      .filter((j) => ingest.jobIds.includes(j.id))
      .map((j) => j.title)
      .sort();
    const gatedTitles = allTestJobs
      .filter((j) => !ingest.jobIds.includes(j.id))
      .map((j) => j.title)
      .sort();

    expect(passedTitles).toEqual(
      ["Backend Engineer", "Hybrid Engineer Tallinn", "Remote Frontend Engineer"].sort(),
    );
    expect(gatedTitles).toEqual(
      ["Full Stack Engineer, AI systems", "Hybrid Engineer London"].sort(),
    );

    // Gated jobs are still upserted/stored with a real remote_type derived
    // (not the old employment-type junk) - just excluded from scoring.
    const gatedJob = allTestJobs.find((j) => j.title === "Hybrid Engineer London");
    expect(gatedJob?.remoteType).toBe("hybrid");
    expect(gatedJob?.embedding).not.toBeNull();
  });
});
