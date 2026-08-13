import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import {
  quotaOverrides,
  usageCounters,
  userSettings,
} from "../db/schema";
import {
  DEFAULT_QUOTA_LIMITS,
  QUOTA_LIMITS,
  QuotaExceededError,
  consumeDocGenQuota,
  consumeScoreCallQuota,
  consumeSearchQuota,
  setUserPlan,
} from "./quota";

// Fake user ids, same pattern as job-search.idempotency.test.ts - no real
// Supabase account needed, quota.ts is tested independently of the
// HTTP/auth layer. One id per plan under test to avoid cross-contamination.
const freeUserId = "00000000-0000-4000-8000-0000000000f1";
const proUserId = "00000000-0000-4000-8000-0000000000f2";
const trustedUserId = "00000000-0000-4000-8000-0000000000f3";
const paygUserId = "00000000-0000-4000-8000-0000000000f4";
const allTestUserIds = [freeUserId, proUserId, trustedUserId, paygUserId];

async function overrideLimit(
  plan: string,
  metric: string,
  limitValue: number,
): Promise<void> {
  await db
    .update(quotaOverrides)
    .set({ limitValue })
    .where(and(eq(quotaOverrides.plan, plan), eq(quotaOverrides.metric, metric)));
}

afterAll(async () => {
  // Restore the seeded defaults for any rows a test temporarily mutated,
  // so this suite never leaves quota_overrides in a different state than
  // it found it. Deliberately never touches the free-plan rows - other
  // concurrently-running test files' default-plan users depend on those
  // staying at their real values throughout the whole suite run.
  await overrideLimit("trusted", "search_daily", 2);
  await overrideLimit("trusted", "score_calls_monthly", 100);

  for (const userId of allTestUserIds) {
    await db.delete(usageCounters).where(eq(usageCounters.userId, userId));
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
  }
});

describe("free plan", () => {
  it("allows 1 search/week then rejects the 2nd with a QuotaExceededError", async () => {
    await setUserPlan(freeUserId, "free");
    await expect(consumeSearchQuota(freeUserId)).resolves.toBeUndefined();

    await expect(consumeSearchQuota(freeUserId)).rejects.toThrow(
      QuotaExceededError,
    );
    try {
      await consumeSearchQuota(freeUserId);
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      const payload = (err as QuotaExceededError).payload;
      expect(payload.metric).toBe("search");
      expect(payload.limit).toBe(DEFAULT_QUOTA_LIMITS.free.searchWeekly);
      expect(payload.plan).toBe("free");
    }
  });

  it("tracks CV and cover letter generation as independent daily caps (1/day each)", async () => {
    await setUserPlan(freeUserId, "free");
    await expect(consumeDocGenQuota(freeUserId, "cv")).resolves.toBeUndefined();
    // Cover letter is untouched by the CV cap - this is the whole point of
    // splitting doc-gen into separate metrics.
    await expect(
      consumeDocGenQuota(freeUserId, "cover_letter"),
    ).resolves.toBeUndefined();

    await expect(consumeDocGenQuota(freeUserId, "cv")).rejects.toThrow(
      QuotaExceededError,
    );
    await expect(
      consumeDocGenQuota(freeUserId, "cover_letter"),
    ).rejects.toThrow(QuotaExceededError);
  });

  it("consumeScoreCallQuota resolves against free's real seeded default (40/month) without throwing", async () => {
    // Deliberately does not mutate the shared free/score_calls_monthly
    // override row - other concurrently-running test files (e.g.
    // job-search.idempotency.test.ts) use free-plan default users and
    // depend on that row staying at its real seeded value. The
    // "editing quota_overrides actually changes enforcement" mechanism is
    // proven separately below using the trusted plan, which nothing else
    // in this suite uses as an implicit default.
    await setUserPlan(freeUserId, "free");
    const result = await consumeScoreCallQuota(freeUserId);
    expect(result.allowed).toBe(true);
  });
});

describe("pro plan (fixed constants, ignores quota_overrides)", () => {
  it("enforces QUOTA_LIMITS.pro.searchDaily even when a quota_overrides row exists for 'pro'", async () => {
    await setUserPlan(proUserId, "pro");

    // Deliberately insert a bogus override for 'pro' - pro must never read
    // this table at all, so it should have zero effect either way.
    await db
      .insert(quotaOverrides)
      .values({ plan: "pro", metric: "search_daily", limitValue: 999 })
      .onConflictDoNothing();

    for (let i = 0; i < QUOTA_LIMITS.pro.searchDaily; i++) {
      await expect(consumeSearchQuota(proUserId)).resolves.toBeUndefined();
    }
    await expect(consumeSearchQuota(proUserId)).rejects.toThrow(
      QuotaExceededError,
    );

    await db
      .delete(quotaOverrides)
      .where(and(eq(quotaOverrides.plan, "pro"), eq(quotaOverrides.metric, "search_daily")));
  });

  it("gives CV and cover letter generation independent monthly caps", async () => {
    await setUserPlan(proUserId, "pro");
    for (let i = 0; i < QUOTA_LIMITS.pro.cvGenMonthly; i++) {
      await expect(
        consumeDocGenQuota(proUserId, "cv"),
      ).resolves.toBeUndefined();
    }
    await expect(consumeDocGenQuota(proUserId, "cv")).rejects.toThrow(
      QuotaExceededError,
    );
    // Cover letter cap is untouched by CV's exhaustion above.
    await expect(
      consumeDocGenQuota(proUserId, "cover_letter"),
    ).resolves.toBeUndefined();
  });
});

describe("trusted plan (respects quota_overrides edits)", () => {
  it("changing the quota_overrides row actually changes search enforcement", async () => {
    await setUserPlan(trustedUserId, "trusted");

    await overrideLimit("trusted", "search_daily", 1);
    await expect(consumeSearchQuota(trustedUserId)).resolves.toBeUndefined();
    await expect(consumeSearchQuota(trustedUserId)).rejects.toThrow(
      QuotaExceededError,
    );

    await overrideLimit("trusted", "search_daily", 2);
  });

  it("changing the quota_overrides row actually changes the scoring backstop", async () => {
    // Distinct metric key from the test above (search_daily vs
    // score_calls_monthly) - same plan, no collision, both safe to run
    // concurrently with each other and with anything else in this suite
    // since nothing else uses trusted-plan test users.
    await setUserPlan(trustedUserId, "trusted");
    await overrideLimit("trusted", "score_calls_monthly", 2);

    const first = await consumeScoreCallQuota(trustedUserId);
    const second = await consumeScoreCallQuota(trustedUserId);
    const third = await consumeScoreCallQuota(trustedUserId);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false); // would be allowed under the real 100 default

    await overrideLimit("trusted", "score_calls_monthly", 100);
  });
});

describe("payg plan (reserved, no metering implemented)", () => {
  it("blocks search and doc-gen rather than allowing unlimited usage", async () => {
    await setUserPlan(paygUserId, "payg");
    await expect(consumeSearchQuota(paygUserId)).rejects.toThrow();
    await expect(consumeDocGenQuota(paygUserId, "cv")).rejects.toThrow();
  });

  it("consumeScoreCallQuota returns allowed:false rather than throwing (worker path, not user-facing)", async () => {
    await setUserPlan(paygUserId, "payg");
    const result = await consumeScoreCallQuota(paygUserId);
    expect(result.allowed).toBe(false);
  });
});
