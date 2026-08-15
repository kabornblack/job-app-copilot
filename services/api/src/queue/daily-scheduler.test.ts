import { afterAll, describe, expect, it } from "vitest";
import { createPipelineQueue } from "./queues";
import { ensureJobScheduler } from "./daily-scheduler";

// Dedicated test scheduler id - deliberately not the real
// DAILY_SEARCH_SCHEDULER_ID, so this test never touches the actual
// production cron schedule the live worker process depends on.
const TEST_SCHEDULER_ID = "test-daily-scheduler-stability";

const queue = createPipelineQueue();

afterAll(async () => {
  await queue.removeJobScheduler(TEST_SCHEDULER_ID);
  await queue.close();
});

describe("ensureJobScheduler", () => {
  it("does not touch the scheduler on repeated calls with the same config (simulated dev-server restarts)", async () => {
    await queue.removeJobScheduler(TEST_SCHEDULER_ID);

    const desired = { pattern: "0 6 * * *", tz: "Europe/Tallinn" };
    const jobTemplate = { name: "test-daily-scheduler", data: {}, opts: {} };

    const first = await ensureJobScheduler(
      queue,
      TEST_SCHEDULER_ID,
      desired,
      jobTemplate,
    );
    // First-ever registration always changes something.
    expect(first.changed).toBe(true);
    expect(first.next).not.toBeNull();

    // Simulate several dev-server restarts in a row, same config each time.
    const second = await ensureJobScheduler(
      queue,
      TEST_SCHEDULER_ID,
      desired,
      jobTemplate,
    );
    const third = await ensureJobScheduler(
      queue,
      TEST_SCHEDULER_ID,
      desired,
      jobTemplate,
    );

    // The real fix under test: neither call touched the scheduler, and the
    // computed next-fire time is byte-identical to what was first
    // established - this is what the old unconditional-upsert code could
    // not guarantee, and what actually caused the cron misfires.
    expect(second.changed).toBe(false);
    expect(second.next).toBe(first.next);
    expect(third.changed).toBe(false);
    expect(third.next).toBe(first.next);
  });

  it("still re-registers when the configuration genuinely changes (pattern edit)", async () => {
    await queue.removeJobScheduler(TEST_SCHEDULER_ID);

    const jobTemplate = { name: "test-daily-scheduler", data: {}, opts: {} };

    const original = await ensureJobScheduler(
      queue,
      TEST_SCHEDULER_ID,
      { pattern: "0 6 * * *", tz: "Europe/Tallinn" },
      jobTemplate,
    );
    expect(original.changed).toBe(true);

    // A genuine config change (different pattern) must still take effect,
    // not be silently skipped by the "already correct" check.
    const changed = await ensureJobScheduler(
      queue,
      TEST_SCHEDULER_ID,
      { pattern: "0 9 * * *", tz: "Europe/Tallinn" },
      jobTemplate,
    );
    expect(changed.changed).toBe(true);
    expect(changed.next).not.toBe(original.next);
  });
});
