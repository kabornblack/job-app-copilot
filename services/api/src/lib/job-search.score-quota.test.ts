import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const { scoreJobMatchWithClaude } = vi.hoisted(() => ({
  scoreJobMatchWithClaude: vi.fn(async () => ({
    score: 55,
    explanation: "Mocked Claude score for score-quota test.",
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
import {
  applications,
  jobs,
  matches,
  profiles,
  usageCounters,
  userSettings,
} from "../db/schema";
import { scoreMatchForJob } from "./job-search";
import { DEFAULT_QUOTA_LIMITS, setUserPlan } from "./quota";

const unique = `score-quota-${Date.now()}`;
const userId = "00000000-0000-4000-8000-0000000000f5";
const profileEmbedding = Array.from({ length: 1536 }, (_, i) =>
  i === 0 ? 0.1 : 0,
);

let profileId = "";
const jobIds: string[] = [];

function utcMonthStartDateString(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

afterAll(async () => {
  for (const jobId of jobIds) {
    await db.delete(applications).where(eq(applications.jobId, jobId));
    await db.delete(matches).where(eq(matches.jobId, jobId));
    await db.delete(jobs).where(eq(jobs.id, jobId));
  }
  if (profileId) {
    await db.delete(profiles).where(eq(profiles.id, profileId));
  }
  await db.delete(usageCounters).where(eq(usageCounters.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
});

describe("scoreMatchForJob honors the scoring safety backstop end-to-end", () => {
  it("scores the first job, then skips the second once the monthly cap is hit", async () => {
    // Uses the free plan's real, untouched limit (40/month) - collision-safe
    // regardless of what other test files run concurrently, because this
    // pre-seeds THIS test's own dedicated user's usage_counters row rather
    // than mutating the shared quota_overrides row every free-plan user
    // reads from (that's what caused a real cross-file race last run - see
    // quota.test.ts's comments on the same issue).
    await setUserPlan(userId, "free");
    const limit = DEFAULT_QUOTA_LIMITS.free.scoreCallsMonthly;
    await db.insert(usageCounters).values({
      userId,
      metric: "score_calls_monthly",
      periodStart: new Date(utcMonthStartDateString()),
      count: limit - 1,
    });

    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        version: 1,
        skills: ["React"],
        targetRoles: ["Frontend engineer"],
        locations: ["Tallinn"],
        remotePref: "any",
        isActive: false,
      })
      .returning();
    profileId = profile.id;

    for (let i = 0; i < 2; i++) {
      const [job] = await db
        .insert(jobs)
        .values({
          source: "test",
          externalId: `${unique}-${i}`,
          fingerprint: `${unique}-${i}`,
          title: `Test Job ${i}`,
          company: "Test Co",
          location: "Tallinn",
          description: "Score-quota backstop test job.",
          url: `https://example.test/jobs/${unique}-${i}`,
          embedding: profileEmbedding,
        })
        .returning();
      jobIds.push(job.id);
    }

    scoreJobMatchWithClaude.mockClear();

    // (limit - 1) already used, so this is the limit-th call - allowed.
    const first = await scoreMatchForJob({
      profile,
      jobId: jobIds[0],
      profileEmbedding,
    });
    expect(first.quotaSkipped).toBe(false);
    expect(first.matchesCreated).toBe(1);
    expect(first.claudeCalls).toBe(1);
    expect(first.result).not.toBeNull();

    // (limit + 1)-th call - over the cap, skipped gracefully.
    const second = await scoreMatchForJob({
      profile,
      jobId: jobIds[1],
      profileEmbedding,
    });
    expect(second.quotaSkipped).toBe(true);
    expect(second.matchesCreated).toBe(0);
    expect(second.applicationsCreated).toBe(0);
    expect(second.claudeCalls).toBe(0);
    expect(second.result).toBeNull();

    // Claude was only ever called for the first job - the backstop's whole
    // purpose is to stop paying for scoring once the cap is hit.
    expect(scoreJobMatchWithClaude).toHaveBeenCalledTimes(1);

    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.jobId, jobIds[1]));
    expect(matchRows).toHaveLength(0);
  });
});
