import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import { db } from "../db/client";
import { profiles, searchRuns } from "../db/schema";
import { consumeSearchQuota, isQuotaExceededError } from "./quota";
import { emptySearchRunStats } from "./search-runs";

export type CronEnqueueResult =
  | { enqueued: false; reason: "no_active_profile" | "all_quota_skipped"; skippedQuotaUserIds?: string[] }
  | {
      enqueued: true;
      runIds: string[];
      profileIds: string[];
      skippedQuotaUserIds: string[];
    };

/**
 * Daily cron tick: enqueue a search-run for every active profile (one per user).
 */
export async function enqueueCronSearchIfActiveProfile(
  queue: Queue,
): Promise<CronEnqueueResult> {
  const activeProfiles = await db
    .select()
    .from(profiles)
    .where(eq(profiles.isActive, true));

  if (activeProfiles.length === 0) {
    console.log(
      JSON.stringify({
        event: "daily-search.noop",
        reason: "no_active_profile",
      }),
    );
    return { enqueued: false, reason: "no_active_profile" };
  }

  const runIds: string[] = [];
  const profileIds: string[] = [];
  const skippedQuotaUserIds: string[] = [];

  for (const activeProfile of activeProfiles) {
    try {
      await consumeSearchQuota(activeProfile.userId);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        skippedQuotaUserIds.push(activeProfile.userId);
        console.log(
          JSON.stringify({
            event: "daily-search.skipped_quota",
            userId: activeProfile.userId,
            profileId: activeProfile.id,
            error: error.payload.error,
          }),
        );
        continue;
      }
      throw error;
    }

    const [run] = await db
      .insert(searchRuns)
      .values({
        userId: activeProfile.userId,
        profileId: activeProfile.id,
        trigger: "cron",
        status: "queued",
        stats: emptySearchRunStats(true),
      })
      .returning();

    if (!run) {
      throw new Error("Failed to create cron search run");
    }

    await queue.add(
      "search-run",
      { runId: run.id, profileId: activeProfile.id },
      {
        jobId: `search-run-${run.id}`,
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    runIds.push(run.id);
    profileIds.push(activeProfile.id);

    console.log(
      JSON.stringify({
        event: "daily-search.enqueued",
        runId: run.id,
        profileId: activeProfile.id,
        userId: activeProfile.userId,
      }),
    );
  }

  if (runIds.length === 0) {
    return {
      enqueued: false,
      reason: "all_quota_skipped",
      skippedQuotaUserIds,
    };
  }

  return {
    enqueued: true,
    runIds,
    profileIds,
    skippedQuotaUserIds,
  };
}
