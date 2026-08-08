import { desc, eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import { db } from "../db/client";
import { profiles, searchRuns } from "../db/schema";
import { emptySearchRunStats } from "./search-runs";

export type CronEnqueueResult =
  | { enqueued: false; reason: "no_active_profile" }
  | {
      enqueued: true;
      runId: string;
      profileId: string;
    };

/**
 * Daily cron tick: enqueue a search-run for the active profile, or no-op.
 * Creates the search_runs row with trigger=cron before queueing.
 */
export async function enqueueCronSearchIfActiveProfile(
  queue: Queue,
): Promise<CronEnqueueResult> {
  const [activeProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .orderBy(desc(profiles.createdAt))
    .limit(1);

  if (!activeProfile) {
    console.log(
      JSON.stringify({
        event: "daily-search.noop",
        reason: "no_active_profile",
      }),
    );
    return { enqueued: false, reason: "no_active_profile" };
  }

  const [run] = await db
    .insert(searchRuns)
    .values({
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

  console.log(
    JSON.stringify({
      event: "daily-search.enqueued",
      runId: run.id,
      profileId: activeProfile.id,
    }),
  );

  return {
    enqueued: true,
    runId: run.id,
    profileId: activeProfile.id,
  };
}
