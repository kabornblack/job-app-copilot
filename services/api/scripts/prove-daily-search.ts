import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { searchRuns } from "../src/db/schema";
import { enqueueCronSearchIfActiveProfile } from "../src/lib/daily-search";
import { createPipelineQueue } from "../src/queue/queues";
import {
  DAILY_SEARCH_SCHEDULER_ID,
  registerDailySearchScheduler,
} from "../src/queue/daily-scheduler";

async function main() {
  const queue = createPipelineQueue();

  // Idempotent register (same as worker startup)
  await registerDailySearchScheduler(queue);
  await registerDailySearchScheduler(queue);

  const schedulers = await queue.getJobSchedulers(0, -1, true);
  const daily = schedulers.filter(
    (scheduler) => scheduler.key === DAILY_SEARCH_SCHEDULER_ID,
  );

  console.log(
    JSON.stringify(
      {
        event: "proof.schedulers",
        countForStableId: daily.length,
        schedulers: daily.map((scheduler) => ({
          key: scheduler.key,
          name: scheduler.name,
          pattern: scheduler.pattern,
          tz: scheduler.tz,
          next: scheduler.next,
        })),
      },
      null,
      2,
    ),
  );

  if (daily.length !== 1) {
    throw new Error(
      `Expected exactly 1 scheduler with key ${DAILY_SEARCH_SCHEDULER_ID}, got ${daily.length}`,
    );
  }

  // Manual trigger of the cron tick logic (no day wait)
  const enqueued = await enqueueCronSearchIfActiveProfile(queue);
  console.log(JSON.stringify({ event: "proof.cron_enqueue", ...enqueued }));

  if (!enqueued.enqueued) {
    throw new Error("No active profile — cannot prove cron search_runs row");
  }

  const runId = enqueued.runIds[0];
  const [row] = await db
    .select()
    .from(searchRuns)
    .where(eq(searchRuns.id, runId))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        event: "proof.search_run_row",
        id: row?.id,
        trigger: row?.trigger,
        status: row?.status,
        profileId: row?.profileId,
        userId: row?.userId,
      },
      null,
      2,
    ),
  );

  if (row?.trigger !== "cron") {
    throw new Error(`Expected trigger=cron, got ${row?.trigger}`);
  }

  // Wait for worker to finish the run (worker must be running)
  for (let i = 0; i < 80; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const [current] = await db
      .select()
      .from(searchRuns)
      .where(eq(searchRuns.id, runId))
      .limit(1);
    console.log(
      JSON.stringify({
        event: "proof.poll",
        status: current?.status,
        stats: current?.stats,
      }),
    );
    if (current?.status === "completed" || current?.status === "failed") {
      console.log(
        JSON.stringify(
          {
            event: "proof.final",
            id: current.id,
            trigger: current.trigger,
            status: current.status,
            stats: current.stats,
            error: current.error,
          },
          null,
          2,
        ),
      );
      await queue.close();
      process.exit(current.status === "completed" ? 0 : 1);
    }
  }

  throw new Error("Timed out waiting for cron search run to complete");
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
