import type { Queue, JobsOptions } from "bullmq";

/** Stable BullMQ job scheduler id. */
export const DAILY_SEARCH_SCHEDULER_ID = "daily-search-run";

/** 06:00 Europe/Tallinn daily. */
export const DAILY_SEARCH_CRON = {
  pattern: "0 6 * * *",
  tz: "Europe/Tallinn",
} as const;

export type EnsureJobSchedulerResult = {
  /** True if upsertJobScheduler was actually called (first-ever
   * registration, or the existing pattern/tz genuinely differed). False
   * means the correctly-configured scheduler already existed and nothing
   * was touched. */
  changed: boolean;
  next: number | null;
};

/**
 * Registers a repeatable job scheduler only if one doesn't already exist
 * with the desired pattern/tz - never calls queue.upsertJobScheduler()
 * unconditionally.
 *
 * BullMQ's public Queue.upsertJobScheduler() always passes { override:
 * true } internally (confirmed by reading bullmq@6.0.9's source directly,
 * not assumed) and, with no prevMillis supplied, recomputes the next fire
 * time relative to wall-clock "now" at the moment it's called - it is not
 * a safe idempotent no-op. Calling it unconditionally on every process
 * start (as this code previously did) re-registers the scheduler on every
 * dev-server restart, which is how the daily search cron ended up firing
 * out of its intended 06:00 Europe/Tallinn cadence. This function is the
 * fix: check current state first, only call upsertJobScheduler when
 * there's a real reason to (missing, or the configuration actually changed).
 */
export async function ensureJobScheduler(
  queue: Queue,
  schedulerId: string,
  desired: { pattern: string; tz: string },
  jobTemplate: { name: string; data?: Record<string, unknown>; opts?: JobsOptions },
): Promise<EnsureJobSchedulerResult> {
  const schedulers = await queue.getJobSchedulers(0, -1, true);
  const existing = schedulers.find((scheduler) => scheduler.key === schedulerId);

  const alreadyCorrect =
    existing !== undefined &&
    existing.pattern === desired.pattern &&
    existing.tz === desired.tz;

  if (alreadyCorrect) {
    return { changed: false, next: existing.next ?? null };
  }

  await queue.upsertJobScheduler(schedulerId, desired, jobTemplate);

  const updated = await queue.getJobSchedulers(0, -1, true);
  const registered = updated.find((scheduler) => scheduler.key === schedulerId);
  return { changed: true, next: registered?.next ?? null };
}

export async function registerDailySearchScheduler(
  queue: Queue,
): Promise<void> {
  const result = await ensureJobScheduler(
    queue,
    DAILY_SEARCH_SCHEDULER_ID,
    { pattern: DAILY_SEARCH_CRON.pattern, tz: DAILY_SEARCH_CRON.tz },
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

  console.log(
    JSON.stringify({
      event: result.changed
        ? "daily-search.scheduler_registered"
        : "daily-search.scheduler_already_registered",
      schedulerId: DAILY_SEARCH_SCHEDULER_ID,
      pattern: DAILY_SEARCH_CRON.pattern,
      tz: DAILY_SEARCH_CRON.tz,
      next: result.next,
    }),
  );
}
