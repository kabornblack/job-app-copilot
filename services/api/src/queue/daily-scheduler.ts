import type { Queue } from "bullmq";

/** Stable BullMQ job scheduler id — upserts on every worker start. */
export const DAILY_SEARCH_SCHEDULER_ID = "daily-search-run";

/** 06:00 Europe/Tallinn daily. */
export const DAILY_SEARCH_CRON = {
  pattern: "0 6 * * *",
  tz: "Europe/Tallinn",
} as const;

export async function registerDailySearchScheduler(
  queue: Queue,
): Promise<void> {
  await queue.upsertJobScheduler(
    DAILY_SEARCH_SCHEDULER_ID,
    {
      pattern: DAILY_SEARCH_CRON.pattern,
      tz: DAILY_SEARCH_CRON.tz,
    },
    {
      name: "daily-search",
      data: {},
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );

  const schedulers = await queue.getJobSchedulers(0, -1, true);
  const registered = schedulers.find(
    (scheduler) => scheduler.key === DAILY_SEARCH_SCHEDULER_ID,
  );

  console.log(
    JSON.stringify({
      event: "daily-search.scheduler_registered",
      schedulerId: DAILY_SEARCH_SCHEDULER_ID,
      pattern: DAILY_SEARCH_CRON.pattern,
      tz: DAILY_SEARCH_CRON.tz,
      found: Boolean(registered),
      next: registered?.next,
    }),
  );
}
