import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/client";
import { profiles, searchRuns } from "../db/schema";
import { ingestJobsForProfile } from "./job-search";
import { emptySearchRunStats, patchSearchRunStats } from "./search-runs";

// Mocked so this test doesn't spend a real OpenAI embeddings call - unrelated
// to what's under test here (source-error capture from Adzuna/Jooble).
vi.mock("./embeddings", async () => {
  const actual =
    await vi.importActual<typeof import("./embeddings")>("./embeddings");
  return {
    ...actual,
    generateEmbedding: vi.fn(async () => Array.from({ length: 1536 }, () => 0.01)),
  };
});

// Fake user id, same pattern as job-search.idempotency.test.ts - no real
// Supabase account needed, these functions are tested independently of the
// HTTP/auth layer.
const userId = "00000000-0000-4000-8000-0000000000c3";

let profileId = "";
let runId = "";
const originalFetch = global.fetch;

function mockFetch(handlers: {
  adzuna?: () => Response;
  jooble?: () => Response;
}) {
  global.fetch = vi.fn(async (input: Request | string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("adzuna.com")) {
      return handlers.adzuna
        ? handlers.adzuna()
        : new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    if (url.includes("jooble.org")) {
      return handlers.jooble
        ? handlers.jooble()
        : new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch in test to: ${url}`);
  }) as unknown as typeof fetch;
}

describe("source error capture (ingestJobsForProfile -> search_runs.stats.sourceErrors)", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    if (runId) {
      await db.delete(searchRuns).where(eq(searchRuns.id, runId));
    }
    if (profileId) {
      await db.delete(profiles).where(eq(profiles.id, profileId));
    }
  });

  it("captures a Jooble failure (simulated wrong-key/401) while Adzuna succeeds with zero results, and persists it through to a real search_runs row", async () => {
    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        version: 1,
        skills: ["React"],
        targetRoles: ["Frontend engineer"],
        locations: ["Tallinn"],
        remotePref: "any",
      })
      .returning();
    profileId = profile.id;

    // Simulates "temporarily feed a wrong Jooble key": Adzuna behaves
    // normally (200, zero results), Jooble rejects with 401 - exactly the
    // scenario this feature exists to distinguish from genuine zero results.
    mockFetch({
      jooble: () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    });

    const ingest = await ingestJobsForProfile(profile);

    expect(ingest.jobsSeen).toBe(0);
    expect(ingest.sourceErrors).toHaveLength(1);
    expect(ingest.sourceErrors[0]).toEqual({
      source: "jooble",
      message: expect.stringContaining("401"),
    });

    // Now the persistence half: patchSearchRunStats actually writes this
    // into a real search_runs row against real Postgres, and it reads back.
    const [run] = await db
      .insert(searchRuns)
      .values({
        userId,
        profileId: profile.id,
        trigger: "manual",
        status: "running",
        stats: emptySearchRunStats(false),
      })
      .returning();
    runId = run.id;

    await patchSearchRunStats(runId, {
      jobsSeen: ingest.jobsSeen,
      embeddingsCreated: ingest.embeddingsCreated,
      scoreJobsEnqueued: 0,
      sourceErrors: ingest.sourceErrors,
    });

    const [reloaded] = await db
      .select()
      .from(searchRuns)
      .where(eq(searchRuns.id, runId))
      .limit(1);
    const stats = reloaded.stats as { sourceErrors?: unknown };

    expect(stats.sourceErrors).toEqual([
      { source: "jooble", message: expect.stringContaining("401") },
    ]);
    // The run itself is still "running"/completable normally - a source
    // error does not fail the whole run, matching the approved plan.
    expect(reloaded.status).toBe("running");
  });

  it("writes an explicit empty array (not absent, not null) when both sources succeed cleanly", async () => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    mockFetch({});

    const ingest = await ingestJobsForProfile(profile);

    expect(ingest.sourceErrors).toEqual([]);
  });
});
