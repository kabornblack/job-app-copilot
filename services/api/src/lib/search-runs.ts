import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { searchRuns } from "../db/schema";

export type SearchRunStats = {
  profileReused: boolean;
  jobsSeen: number;
  embeddingsCreated: number;
  matchesCreated: number;
  matchesReused: number;
  applicationsCreated: number;
  claudeCalls: number;
  scoreJobsEnqueued: number;
  scoreJobsFinished: number;
  scoreJobsFailed: number;
};

export function emptySearchRunStats(
  profileReused: boolean,
): SearchRunStats {
  return {
    profileReused,
    jobsSeen: 0,
    embeddingsCreated: 0,
    matchesCreated: 0,
    matchesReused: 0,
    applicationsCreated: 0,
    claudeCalls: 0,
    scoreJobsEnqueued: 0,
    scoreJobsFinished: 0,
    scoreJobsFailed: 0,
  };
}

function asStats(value: unknown, fallbackReused = false): SearchRunStats {
  const partial = (value ?? {}) as Partial<SearchRunStats>;
  return { ...emptySearchRunStats(fallbackReused), ...partial };
}

export async function markSearchRunRunning(runId: string): Promise<void> {
  await db
    .update(searchRuns)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(eq(searchRuns.id, runId));
}

export async function patchSearchRunStats(
  runId: string,
  patch: Partial<SearchRunStats>,
): Promise<void> {
  const [existing] = await db
    .select({ stats: searchRuns.stats })
    .from(searchRuns)
    .where(eq(searchRuns.id, runId))
    .limit(1);

  await db
    .update(searchRuns)
    .set({
      stats: { ...asStats(existing?.stats), ...patch },
    })
    .where(eq(searchRuns.id, runId));
}

export async function markSearchRunCompleted(runId: string): Promise<void> {
  await db
    .update(searchRuns)
    .set({
      status: "completed",
      finishedAt: new Date(),
    })
    .where(eq(searchRuns.id, runId));
}

export async function markSearchRunFailed(
  runId: string,
  error: string,
): Promise<void> {
  await db
    .update(searchRuns)
    .set({
      status: "failed",
      error,
      finishedAt: new Date(),
    })
    .where(eq(searchRuns.id, runId));
}

type ScoreDelta = {
  matchesCreated?: number;
  matchesReused?: number;
  applicationsCreated?: number;
  claudeCalls?: number;
  failed?: boolean;
};

/**
 * Bump per-score counters and scoreJobsFinished inside a transaction.
 * When finished >= enqueued, marks the run completed (or failed if any failed).
 */
export async function recordScoreMatchProgress(
  runId: string,
  delta: ScoreDelta,
): Promise<{ status: string; finished: boolean }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(searchRuns)
      .where(eq(searchRuns.id, runId))
      .for("update")
      .limit(1);

    if (!existing) {
      return { status: "unknown", finished: false };
    }

    if (existing.status !== "running") {
      return { status: existing.status, finished: false };
    }

    const stats = asStats(existing.stats);
    stats.matchesCreated += delta.matchesCreated ?? 0;
    stats.matchesReused += delta.matchesReused ?? 0;
    stats.applicationsCreated += delta.applicationsCreated ?? 0;
    stats.claudeCalls += delta.claudeCalls ?? 0;
    stats.scoreJobsFinished += 1;
    if (delta.failed) {
      stats.scoreJobsFailed += 1;
    }

    const done =
      stats.scoreJobsEnqueued > 0 &&
      stats.scoreJobsFinished >= stats.scoreJobsEnqueued;

    if (done) {
      if (stats.scoreJobsFailed > 0) {
        await tx
          .update(searchRuns)
          .set({
            stats,
            status: "failed",
            error: `${stats.scoreJobsFailed} score-match job(s) failed`,
            finishedAt: new Date(),
          })
          .where(eq(searchRuns.id, runId));
        return { status: "failed", finished: true };
      }

      await tx
        .update(searchRuns)
        .set({
          stats,
          status: "completed",
          finishedAt: new Date(),
        })
        .where(eq(searchRuns.id, runId));
      return { status: "completed", finished: true };
    }

    await tx
      .update(searchRuns)
      .set({ stats })
      .where(eq(searchRuns.id, runId));
    return { status: "running", finished: false };
  });
}
