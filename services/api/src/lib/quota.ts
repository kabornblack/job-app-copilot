import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  usageCounters,
  userSettings,
  type UserPlan,
} from "../db/schema";

export const TRIAL_WINDOW_DAYS = 14;

export const QUOTA_LIMITS = {
  trusted: {
    searchDaily: 50,
    docGenMonthly: 100,
  },
  trial: {
    searchDaily: 2,
    searchTotal: 10,
    docGenTotal: 5,
  },
} as const;

export type QuotaMetric = "search" | "doc_gen";

export type QuotaExceededPayload = {
  error: string;
  code: "QUOTA_EXCEEDED";
  metric: QuotaMetric;
  limit: number;
  used: number;
  resetsAt: string | null;
  plan: UserPlan;
};

export class QuotaExceededError extends Error {
  readonly statusCode = 429;
  readonly payload: QuotaExceededPayload;

  constructor(payload: QuotaExceededPayload) {
    super(payload.error);
    this.name = "QuotaExceededError";
    this.payload = payload;
  }
}

const METRIC_SEARCH_DAILY = "search_daily";
const METRIC_SEARCH_TRIAL_TOTAL = "search_trial_total";
const METRIC_DOC_GEN = "doc_gen";

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function utcMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function utcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function endOfUtcDayIso(day: Date): string {
  const end = addUtcDays(day, 1);
  return new Date(end.getTime() - 1).toISOString();
}

function periodStartSql(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function returningCount(result: unknown): number | null {
  const rows = (result as { rows?: { count: number | string }[] })?.rows;
  const count = rows?.[0]?.count;
  return count === undefined || count === null ? null : Number(count);
}

export async function ensureUserSettings(userId: string) {
  const existing = (
    await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
  )[0];
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(userSettings)
    .values({
      userId,
      plan: "trial",
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return created;
  }

  const again = (
    await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
  )[0];
  if (!again) {
    throw new Error("Failed to ensure user_settings");
  }
  return again;
}

export async function setUserPlan(
  userId: string,
  plan: UserPlan,
): Promise<void> {
  await ensureUserSettings(userId);
  await db
    .update(userSettings)
    .set({ plan, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}

async function readCounter(
  userId: string,
  metric: string,
  periodStart: Date,
): Promise<number> {
  const row = (
    await db
      .select()
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.metric, metric),
          eq(usageCounters.periodStart, periodStart),
        ),
      )
      .limit(1)
  )[0];
  return row?.count ?? 0;
}

/**
 * Atomically increment a counter if under limit.
 * Returns new count, or null if the limit would be exceeded.
 */
async function tryIncrementCounter(
  userId: string,
  metric: string,
  periodStart: Date,
  limit: number,
): Promise<number | null> {
  const period = periodStartSql(periodStart);
  const result = await db.execute(sql`
    INSERT INTO usage_counters (user_id, metric, period_start, count)
    VALUES (${userId}::uuid, ${metric}, ${period}::date, 1)
    ON CONFLICT (user_id, metric, period_start)
    DO UPDATE SET count = usage_counters.count + 1
    WHERE usage_counters.count < ${limit}
    RETURNING count
  `);

  return returningCount(result);
}

function trialExpired(settings: { trialStartedAt: Date }): boolean {
  const start = settings.trialStartedAt;
  const end = addUtcDays(start, TRIAL_WINDOW_DAYS);
  return Date.now() >= end.getTime();
}

export async function consumeSearchQuota(userId: string): Promise<void> {
  const settings = await ensureUserSettings(userId);
  const plan = settings.plan === "trusted" ? "trusted" : "trial";
  const today = utcToday();

  if (plan === "trusted") {
    const limit = QUOTA_LIMITS.trusted.searchDaily;
    const used = await readCounter(userId, METRIC_SEARCH_DAILY, today);
    const next = await tryIncrementCounter(
      userId,
      METRIC_SEARCH_DAILY,
      today,
      limit,
    );
    if (next === null) {
      throw new QuotaExceededError({
        error: `Daily search limit reached (${limit}/day).`,
        code: "QUOTA_EXCEEDED",
        metric: "search",
        limit,
        used,
        resetsAt: endOfUtcDayIso(today),
        plan,
      });
    }
    return;
  }

  if (trialExpired(settings)) {
    throw new QuotaExceededError({
      error: "Trial ended. Contact us to continue.",
      code: "QUOTA_EXCEEDED",
      metric: "search",
      limit: QUOTA_LIMITS.trial.searchTotal,
      used: await readCounter(
        userId,
        METRIC_SEARCH_TRIAL_TOTAL,
        utcDateOnly(settings.trialStartedAt),
      ),
      resetsAt: null,
      plan,
    });
  }

  const trialStart = utcDateOnly(settings.trialStartedAt);
  const totalLimit = QUOTA_LIMITS.trial.searchTotal;
  const dailyLimit = QUOTA_LIMITS.trial.searchDaily;
  const totalUsed = await readCounter(
    userId,
    METRIC_SEARCH_TRIAL_TOTAL,
    trialStart,
  );
  const dailyUsed = await readCounter(userId, METRIC_SEARCH_DAILY, today);

  if (totalUsed >= totalLimit) {
    throw new QuotaExceededError({
      error: `Trial search limit reached (${totalLimit} total).`,
      code: "QUOTA_EXCEEDED",
      metric: "search",
      limit: totalLimit,
      used: totalUsed,
      resetsAt: null,
      plan,
    });
  }

  if (dailyUsed >= dailyLimit) {
    throw new QuotaExceededError({
      error: `Daily search limit reached (${dailyLimit}/day).`,
      code: "QUOTA_EXCEEDED",
      metric: "search",
      limit: dailyLimit,
      used: dailyUsed,
      resetsAt: endOfUtcDayIso(today),
      plan,
    });
  }

  await db.transaction(async (tx) => {
    const totalResult = await tx.execute(sql`
      INSERT INTO usage_counters (user_id, metric, period_start, count)
      VALUES (${userId}::uuid, ${METRIC_SEARCH_TRIAL_TOTAL}, ${periodStartSql(trialStart)}::date, 1)
      ON CONFLICT (user_id, metric, period_start)
      DO UPDATE SET count = usage_counters.count + 1
      WHERE usage_counters.count < ${totalLimit}
      RETURNING count
    `);
    if (returningCount(totalResult) === null) {
      throw new QuotaExceededError({
        error: `Trial search limit reached (${totalLimit} total).`,
        code: "QUOTA_EXCEEDED",
        metric: "search",
        limit: totalLimit,
        used: totalUsed,
        resetsAt: null,
        plan,
      });
    }

    const dailyResult = await tx.execute(sql`
      INSERT INTO usage_counters (user_id, metric, period_start, count)
      VALUES (${userId}::uuid, ${METRIC_SEARCH_DAILY}, ${periodStartSql(today)}::date, 1)
      ON CONFLICT (user_id, metric, period_start)
      DO UPDATE SET count = usage_counters.count + 1
      WHERE usage_counters.count < ${dailyLimit}
      RETURNING count
    `);
    if (returningCount(dailyResult) === null) {
      throw new QuotaExceededError({
        error: `Daily search limit reached (${dailyLimit}/day).`,
        code: "QUOTA_EXCEEDED",
        metric: "search",
        limit: dailyLimit,
        used: dailyUsed,
        resetsAt: endOfUtcDayIso(today),
        plan,
      });
    }
  });
}

export async function consumeDocGenQuota(userId: string): Promise<void> {
  const settings = await ensureUserSettings(userId);
  const plan = settings.plan === "trusted" ? "trusted" : "trial";

  if (plan === "trusted") {
    const period = utcMonthStart();
    const limit = QUOTA_LIMITS.trusted.docGenMonthly;
    const used = await readCounter(userId, METRIC_DOC_GEN, period);
    const next = await tryIncrementCounter(
      userId,
      METRIC_DOC_GEN,
      period,
      limit,
    );
    if (next === null) {
      throw new QuotaExceededError({
        error: `Monthly document generation limit reached (${limit}/month).`,
        code: "QUOTA_EXCEEDED",
        metric: "doc_gen",
        limit,
        used,
        resetsAt: new Date(
          Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1),
        ).toISOString(),
        plan,
      });
    }
    return;
  }

  if (trialExpired(settings)) {
    throw new QuotaExceededError({
      error: "Trial ended. Contact us to continue.",
      code: "QUOTA_EXCEEDED",
      metric: "doc_gen",
      limit: QUOTA_LIMITS.trial.docGenTotal,
      used: await readCounter(
        userId,
        METRIC_DOC_GEN,
        utcDateOnly(settings.trialStartedAt),
      ),
      resetsAt: null,
      plan,
    });
  }

  const trialStart = utcDateOnly(settings.trialStartedAt);
  const limit = QUOTA_LIMITS.trial.docGenTotal;
  const used = await readCounter(userId, METRIC_DOC_GEN, trialStart);
  if (used >= limit) {
    throw new QuotaExceededError({
      error: `Trial document generation limit reached (${limit} total).`,
      code: "QUOTA_EXCEEDED",
      metric: "doc_gen",
      limit,
      used,
      resetsAt: null,
      plan,
    });
  }

  const next = await tryIncrementCounter(
    userId,
    METRIC_DOC_GEN,
    trialStart,
    limit,
  );
  if (next === null) {
    throw new QuotaExceededError({
      error: `Trial document generation limit reached (${limit} total).`,
      code: "QUOTA_EXCEEDED",
      metric: "doc_gen",
      limit,
      used,
      resetsAt: null,
      plan,
    });
  }
}

export function isQuotaExceededError(
  error: unknown,
): error is QuotaExceededError {
  return error instanceof QuotaExceededError;
}
