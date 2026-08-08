import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { scoreJobMatchWithClaude } = vi.hoisted(() => ({
  scoreJobMatchWithClaude: vi.fn(async () => ({
    score: 61,
    explanation: "Mocked Claude score for idempotency test.",
  })),
}));

vi.mock("./claude-score", async () => {
  const actual =
    await vi.importActual<typeof import("./claude-score")>("./claude-score");
  return {
    ...actual,
    scoreJobMatchWithClaude,
    CLAUDE_SCORE_MODEL_VERSION: "test-claude-mock-v1",
  };
});

import { db } from "../db/client";
import { applications, jobs, matches, profiles } from "../db/schema";
import { scoreMatchForJob } from "./job-search";

const unique = `idempotency-${Date.now()}`;

describe("scoreMatchForJob idempotency", () => {
  let profileId = "";
  let jobId = "";
  const profileEmbedding = Array.from({ length: 1536 }, (_, i) =>
    i === 0 ? 0.1 : 0,
  );

  beforeAll(async () => {
    const [profile] = await db
      .insert(profiles)
      .values({
        version: 1,
        skills: ["React", "TypeScript"],
        targetRoles: ["Software Engineer"],
        locations: ["London"],
        currency: "EUR",
        remotePref: "any",
        resumeSummary: `Idempotency test profile ${unique}`,
        isActive: false,
      })
      .returning();

    const [job] = await db
      .insert(jobs)
      .values({
        source: "test",
        externalId: unique,
        fingerprint: unique,
        title: "Test Engineer",
        company: "Test Co",
        location: "London",
        remoteType: "hybrid",
        description: "React TypeScript role for idempotency tests.",
        url: `https://example.test/jobs/${unique}`,
        embedding: profileEmbedding,
      })
      .returning();

    profileId = profile.id;
    jobId = job.id;
  });

  afterAll(async () => {
    if (jobId) {
      await db.delete(applications).where(eq(applications.jobId, jobId));
      await db.delete(matches).where(eq(matches.jobId, jobId));
      await db.delete(jobs).where(eq(jobs.id, jobId));
    }
    if (profileId) {
      await db.delete(profiles).where(eq(profiles.id, profileId));
    }
  });

  it("does not call Claude or double-insert when a match already exists", async () => {
    scoreJobMatchWithClaude.mockClear();

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    const first = await scoreMatchForJob({
      profile,
      jobId,
      profileEmbedding,
    });
    expect(first.matchesCreated).toBe(1);
    expect(first.applicationsCreated).toBe(1);
    expect(first.claudeCalls).toBe(1);
    expect(scoreJobMatchWithClaude).toHaveBeenCalledTimes(1);

    const second = await scoreMatchForJob({
      profile,
      jobId,
      profileEmbedding,
    });
    expect(second.matchesCreated).toBe(0);
    expect(second.matchesReused).toBe(1);
    expect(second.applicationsCreated).toBe(0);
    expect(second.claudeCalls).toBe(0);
    expect(scoreJobMatchWithClaude).toHaveBeenCalledTimes(1);

    const matchRows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.jobId, jobId), eq(matches.profileId, profileId)));
    const appRows = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, jobId));

    expect(matchRows).toHaveLength(1);
    expect(appRows).toHaveLength(1);
  });

  it("retry after a simulated mid-job crash does not duplicate rows", async () => {
    const crashKey = `${unique}-crash`;
    const [crashJob] = await db
      .insert(jobs)
      .values({
        source: "test",
        externalId: crashKey,
        fingerprint: crashKey,
        title: "Crash Retry Engineer",
        company: "Test Co",
        location: "London",
        description: "Used to simulate worker retry after partial success.",
        url: `https://example.test/jobs/${crashKey}`,
        embedding: profileEmbedding,
      })
      .returning();

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    scoreJobMatchWithClaude.mockClear();

    const first = await scoreMatchForJob({
      profile,
      jobId: crashJob.id,
      profileEmbedding,
    });
    expect(first.matchesCreated).toBe(1);
    expect(first.applicationsCreated).toBe(1);

    const retry = await scoreMatchForJob({
      profile,
      jobId: crashJob.id,
      profileEmbedding,
    });
    expect(retry.matchesReused).toBe(1);
    expect(retry.matchesCreated).toBe(0);
    expect(retry.applicationsCreated).toBe(0);
    expect(retry.claudeCalls).toBe(0);
    expect(scoreJobMatchWithClaude).toHaveBeenCalledTimes(1);

    const matchRows = await db
      .select()
      .from(matches)
      .where(
        and(eq(matches.jobId, crashJob.id), eq(matches.profileId, profileId)),
      );
    const appRows = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, crashJob.id));

    expect(matchRows).toHaveLength(1);
    expect(appRows).toHaveLength(1);

    await db.delete(applications).where(eq(applications.jobId, crashJob.id));
    await db.delete(matches).where(eq(matches.jobId, crashJob.id));
    await db.delete(jobs).where(eq(jobs.id, crashJob.id));
  });
});
