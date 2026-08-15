import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  quotaOverrides,
  usageCounters,
  userSettings,
  type UserPlan,
} from "../db/schema";

/**
 * Pro's numbers are fixed code constants - a paying user's allowance
 * shouldn't silently change under them. Free and Trusted's numbers live in
 * quota_overrides (editable without a deploy); DEFAULT_QUOTA_LIMITS below is
 * only the fallback used if a row is ever unexpectedly missing.
 */
export const QUOTA_LIMITS = {
  pro: {
    searchDaily: 5,
    scoreCallsMonthly: 300,
    cvGenMonthly: 20,
    coverLetterGenMonthly: 20,
  },
} as const;

export const DEFAULT_QUOTA_LIMITS = {
  free: {
    searchWeekly: 1,
    cvGenDaily: 1,
    coverLetterGenDaily: 1,
    scoreCallsMonthly: 40,
  },
  trusted: {
    searchDaily: 2,
    scoreCallsMonthly: 100,
    cvGenMonthly: 8,
    coverLetterGenMonthly: 8,
  },
} as const;

export type QuotaMetric = "search" | "cv_gen" | "cover_letter_gen";

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

const METRIC_SEARCH_WEEKLY = "search_weekly";
const METRIC_SEARCH_DAILY = "search_daily";
const METRIC_SEARCH_CRON_DAILY = "search_cron_daily";
const METRIC_CV_GEN_DAILY = "cv_gen_daily";
const METRIC_COVER_LETTER_GEN_DAILY = "cover_letter_gen_daily";
const METRIC_CV_GEN_MONTHLY = "cv_gen_monthly";
const METRIC_COVER_LETTER_GEN_MONTHLY = "cover_letter_gen_monthly";
const METRIC_SCORE_CALLS_MONTHLY = "score_calls_monthly";

/**
 * Cron's own daily allowance, entirely separate from consumeSearchQuota's
 * manual search_daily counter - a background refresh must never be able to
 * eat into a user's own manual search budget (the exact bug this fixes: a
 * scheduler misfire silently consumed 2/2 of a trusted user's manual daily
 * searches with zero manual action). Same fixed-safety-cap treatment as
 * QUOTA_LIMITS - not plan-tiered, not admin-editable via quota_overrides,
 * since it's a backstop, not a plan feature.
 */
export const CRON_SEARCH_DAILY_LIMIT = 1;

function normalizePlan(value: string): UserPlan {
  if (value === "pro" || value === "trusted" || value === "payg") {
    return value;
  }
  return "free";
}

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

/** Monday 00:00 UTC of the current week. */
function utcWeekStart(): Date {
  const today = utcToday();
  const day = today.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  return addUtcDays(today, -diffToMonday);
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

function endOfUtcWeekIso(weekStart: Date): string {
  const end = addUtcDays(weekStart, 7);
  return new Date(end.getTime() - 1).toISOString();
}

function startOfNextUtcMonthIso(monthStart: Date): string {
  return new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  ).toISOString();
}

function periodStartSql(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function returningCount(result: unknown): number | null {
  const rows = (result as { rows?: { count: number | string }[] })?.rows;
  const count = rows?.[0]?.count;
  return count === undefined || count === null ? null : Number(count);
}

/** Looks up an editable free/trusted quota number, falling back to the
 * hardcoded default if the row is ever unexpectedly missing. Pro never
 * calls this - it always uses QUOTA_LIMITS.pro directly. */
async function getQuotaLimit(
  plan: "free" | "trusted",
  metric: string,
  fallback: number,
): Promise<number> {
  const [row] = await db
    .select()
    .from(quotaOverrides)
    .where(and(eq(quotaOverrides.plan, plan), eq(quotaOverrides.metric, metric)))
    .limit(1);
  return row?.limitValue ?? fallback;
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
      plan: "free",
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

export async function consumeSearchQuota(userId: string): Promise<void> {
  const settings = await ensureUserSettings(userId);
  const plan = normalizePlan(settings.plan);

  if (plan === "payg") {
    throw new Error(
      "payg plan has no metering implemented yet - cannot consume search quota",
    );
  }

  if (plan === "free") {
    const limit = await getQuotaLimit(
      "free",
      METRIC_SEARCH_WEEKLY,
      DEFAULT_QUOTA_LIMITS.free.searchWeekly,
    );
    const period = utcWeekStart();
    const used = await readCounter(userId, METRIC_SEARCH_WEEKLY, period);
    const next = await tryIncrementCounter(
      userId,
      METRIC_SEARCH_WEEKLY,
      period,
      limit,
    );
    if (next === null) {
      throw new QuotaExceededError({
        error: `Weekly search limit reached (${limit}/week).`,
        code: "QUOTA_EXCEEDED",
        metric: "search",
        limit,
        used,
        resetsAt: endOfUtcWeekIso(period),
        plan,
      });
    }
    return;
  }

  const limit =
    plan === "pro"
      ? QUOTA_LIMITS.pro.searchDaily
      : await getQuotaLimit(
          "trusted",
          METRIC_SEARCH_DAILY,
          DEFAULT_QUOTA_LIMITS.trusted.searchDaily,
        );
  const period = utcToday();
  const used = await readCounter(userId, METRIC_SEARCH_DAILY, period);
  const next = await tryIncrementCounter(
    userId,
    METRIC_SEARCH_DAILY,
    period,
    limit,
  );
  if (next === null) {
    throw new QuotaExceededError({
      error: `Daily search limit reached (${limit}/day).`,
      code: "QUOTA_EXCEEDED",
      metric: "search",
      limit,
      used,
      resetsAt: endOfUtcDayIso(period),
      plan,
    });
  }
}

/**
 * Cron's own quota, separate from and never touching consumeSearchQuota's
 * manual counter (enqueueCronSearchIfActiveProfile calls this instead of
 * consumeSearchQuota, not in addition to it). Fixed 1/day for every plan -
 * not plan-tiered, since this is a safety backstop against the daily
 * scheduler ever firing more than once in a day, not a plan feature.
 */
export async function consumeCronSearchQuota(userId: string): Promise<void> {
  const settings = await ensureUserSettings(userId);
  const plan = normalizePlan(settings.plan);

  if (plan === "payg") {
    throw new Error(
      "payg plan has no metering implemented yet - cannot consume cron search quota",
    );
  }

  const limit = CRON_SEARCH_DAILY_LIMIT;
  const period = utcToday();
  const used = await readCounter(userId, METRIC_SEARCH_CRON_DAILY, period);
  const next = await tryIncrementCounter(
    userId,
    METRIC_SEARCH_CRON_DAILY,
    period,
    limit,
  );
  if (next === null) {
    throw new QuotaExceededError({
      error: `Daily cron search limit reached (${limit}/day).`,
      code: "QUOTA_EXCEEDED",
      metric: "search",
      limit,
      used,
      resetsAt: endOfUtcDayIso(period),
      plan,
    });
  }
}

export async function consumeDocGenQuota(
  userId: string,
  docType: "cv" | "cover_letter",
): Promise<void> {
  const settings = await ensureUserSettings(userId);
  const plan = normalizePlan(settings.plan);
  const label = docType === "cv" ? "CV" : "cover letter";

  if (plan === "payg") {
    throw new Error(
      "payg plan has no metering implemented yet - cannot consume doc-gen quota",
    );
  }

  if (plan === "free") {
    const metric =
      docType === "cv" ? METRIC_CV_GEN_DAILY : METRIC_COVER_LETTER_GEN_DAILY;
    const fallback =
      docType === "cv"
        ? DEFAULT_QUOTA_LIMITS.free.cvGenDaily
        : DEFAULT_QUOTA_LIMITS.free.coverLetterGenDaily;
    const limit = await getQuotaLimit("free", metric, fallback);
    const period = utcToday();
    const used = await readCounter(userId, metric, period);
    const next = await tryIncrementCounter(userId, metric, period, limit);
    if (next === null) {
      throw new QuotaExceededError({
        error: `Daily ${label} generation limit reached (${limit}/day).`,
        code: "QUOTA_EXCEEDED",
        metric: docType === "cv" ? "cv_gen" : "cover_letter_gen",
        limit,
        used,
        resetsAt: endOfUtcDayIso(period),
        plan,
      });
    }
    return;
  }

  const metric =
    docType === "cv" ? METRIC_CV_GEN_MONTHLY : METRIC_COVER_LETTER_GEN_MONTHLY;
  const limit =
    plan === "pro"
      ? docType === "cv"
        ? QUOTA_LIMITS.pro.cvGenMonthly
        : QUOTA_LIMITS.pro.coverLetterGenMonthly
      : await getQuotaLimit(
          "trusted",
          metric,
          docType === "cv"
            ? DEFAULT_QUOTA_LIMITS.trusted.cvGenMonthly
            : DEFAULT_QUOTA_LIMITS.trusted.coverLetterGenMonthly,
        );
  const period = utcMonthStart();
  const used = await readCounter(userId, metric, period);
  const next = await tryIncrementCounter(userId, metric, period, limit);
  if (next === null) {
    throw new QuotaExceededError({
      error: `Monthly ${label} generation limit reached (${limit}/month).`,
      code: "QUOTA_EXCEEDED",
      metric: docType === "cv" ? "cv_gen" : "cover_letter_gen",
      limit,
      used,
      resetsAt: startOfNextUtcMonthIso(period),
      plan,
    });
  }
}

/**
 * Scoring safety backstop (free/pro/trusted, 40/300/100 per month
 * respectively) - guards against one broad query matching an unusually
 * large number of postings, not normal usage. Distinct from
 * consumeSearchQuota (how many times you can click Search) and
 * consumeDocGenQuota (how many CVs/cover letters you can generate).
 *
 * Not user-facing: this runs inside the async scoring worker, not an
 * interactive HTTP request, so it never throws. Callers should skip the
 * Claude call gracefully when `allowed` is false and let the run continue -
 * see scoreMatchForJob (job-search.ts) and search_runs.stats.
 * scoreJobsQuotaSkipped for how the skip surfaces after the fact.
 */
export async function consumeScoreCallQuota(
  userId: string,
): Promise<{ allowed: boolean }> {
  const settings = await ensureUserSettings(userId);
  const plan = normalizePlan(settings.plan);

  if (plan === "payg") {
    return { allowed: false };
  }

  const limit =
    plan === "pro"
      ? QUOTA_LIMITS.pro.scoreCallsMonthly
      : await getQuotaLimit(
          plan,
          METRIC_SCORE_CALLS_MONTHLY,
          DEFAULT_QUOTA_LIMITS[plan].scoreCallsMonthly,
        );
  const period = utcMonthStart();
  const next = await tryIncrementCounter(
    userId,
    METRIC_SCORE_CALLS_MONTHLY,
    period,
    limit,
  );
  return { allowed: next !== null };
}

export function isQuotaExceededError(
  error: unknown,
): error is QuotaExceededError {
  return error instanceof QuotaExceededError;
}
