import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  date,
  uuid,
  boolean,
  integer,
  smallint,
  numeric,
  vector,
  jsonb,
  unique,
  check,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const applicationStatus = pgEnum("application_status", [
  "found",
  "reviewing",
  "tailored",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
]);

export const searchRunStatus = pgEnum("search_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const searchRunTrigger = pgEnum("search_run_trigger", [
  "manual",
  "cron",
]);

/** Supabase auth user uuid — no cross-DB FK (local Postgres ≠ Supabase Auth). */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    version: integer("version").notNull().default(1),
    skills: text("skills").array().notNull().default([]),
    targetRoles: text("target_roles").array().notNull().default([]),
    locations: text("locations").array().notNull().default([]),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency").default("EUR"),
    remotePref: text("remote_pref"),
    resumeSummary: text("resume_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    userIdIdx: index("profiles_user_id_idx").on(table.userId),
    oneActivePerUser: uniqueIndex("profiles_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.isActive} = true`),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    remoteType: text("remote_type"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    description: text("description"),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => ({
    sourceExternalIdUnique: unique("jobs_source_external_id_unique").on(
      table.source,
      table.externalId,
    ),
    fingerprintIdx: index("jobs_fingerprint_idx").on(table.fingerprint),
  }),
);

export const jobSourceListings = pgTable(
  "job_source_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .references(() => jobs.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceExternalIdUnique: unique(
      "job_source_listings_source_external_id_unique",
    ).on(table.source, table.externalId),
    jobIdIdx: index("job_source_listings_job_id_idx").on(table.jobId),
  }),
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    jobId: uuid("job_id")
      .references(() => jobs.id, { onDelete: "cascade" })
      .notNull(),
    profileId: uuid("profile_id")
      .references(() => profiles.id)
      .notNull(),
    score: numeric("score", { precision: 4, scale: 1 }).notNull(),
    explanation: text("explanation").notNull(),
    semanticSimilarity: numeric("semantic_similarity", {
      precision: 5,
      scale: 4,
    }),
    modelVersion: text("model_version").notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("matches_user_id_idx").on(table.userId),
  }),
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    jobId: uuid("job_id")
      .references(() => jobs.id)
      .notNull(),
    matchId: uuid("match_id").references(() => matches.id),
    status: applicationStatus("status").notNull().default("found"),
    cvDocumentId: uuid("cv_document_id"),
    coverLetterDocumentId: uuid("cover_letter_document_id"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("applications_user_id_idx").on(table.userId),
  }),
);

export const applicationStatusHistory = pgTable("application_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .notNull(),
  status: applicationStatus("status").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  note: text("note"),
});

export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    applicationId: uuid("application_id")
      .references(() => applications.id, { onDelete: "cascade" })
      .notNull(),
    docType: text("doc_type").notNull(),
    content: text("content"),
    contentJson: jsonb("content_json"),
    filePath: text("file_path"),
    promptVersion: text("prompt_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("generated_documents_user_id_idx").on(table.userId),
  }),
);

export const searchRuns = pgTable(
  "search_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    profileId: uuid("profile_id")
      .references(() => profiles.id)
      .notNull(),
    trigger: searchRunTrigger("trigger").notNull(),
    status: searchRunStatus("status").notNull().default("queued"),
    stats: jsonb("stats").notNull().default({}),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("search_runs_user_id_idx").on(table.userId),
  }),
);

export const userPlanEnum = ["free", "pro", "trusted", "payg"] as const;
export type UserPlan = (typeof userPlanEnum)[number];

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  plan: text("plan").notNull().default("free"),
  // Vestigial since the free/pro/trusted restructure (migration 0009) - free
  // is a permanent tier now, not a time-boxed trial, so this is no longer
  // read for expiry logic. Left in place rather than dropped (smaller diff).
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Editable-without-a-deploy quota numbers for the free/trusted plans
 * (migration 0009 / ADR-pending: plan restructure). Pro's numbers are fixed
 * code constants (QUOTA_LIMITS.pro in lib/quota.ts) and deliberately never
 * have rows here. Same generic (key, key, value) shape as usageCounters.
 */
export const quotaOverrides = pgTable(
  "quota_overrides",
  {
    plan: text("plan").notNull(),
    metric: text("metric").notNull(),
    limitValue: integer("limit_value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: "quota_overrides_pkey",
      columns: [table.plan, table.metric],
    }),
  }),
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id").notNull(),
    metric: text("metric").notNull(),
    periodStart: date("period_start", { mode: "date" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({
      name: "usage_counters_pkey",
      columns: [table.userId, table.metric, table.periodStart],
    }),
    userIdIdx: index("usage_counters_user_id_idx").on(table.userId),
  }),
);

/**
 * Phase 7 / ADR-0004: profile knowledge base. user_id-scoped (no FK to
 * Supabase auth.users, matching the existing pattern), none versioned like
 * profiles. Feeds document generation/display only — profiles.skills stays
 * untouched and continues to drive matching/embeddings.
 */
export const personalDetails = pgTable("personal_details", {
  userId: uuid("user_id").primaryKey(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  portfolioUrl: text("portfolio_url"),
  professionalSummary: text("professional_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workExperience = pgTable(
  "work_experience",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    startMonth: smallint("start_month").notNull(),
    startYear: smallint("start_year").notNull(),
    endMonth: smallint("end_month"),
    endYear: smallint("end_year"),
    bullets: text("bullets").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("work_experience_user_id_idx").on(table.userId),
    startMonthCheck: check(
      "work_experience_start_month_check",
      sql`${table.startMonth} BETWEEN 1 AND 12`,
    ),
    endMonthCheck: check(
      "work_experience_end_month_check",
      sql`${table.endMonth} IS NULL OR ${table.endMonth} BETWEEN 1 AND 12`,
    ),
    endDatePairCheck: check(
      "work_experience_end_date_pair_check",
      sql`(${table.endMonth} IS NULL) = (${table.endYear} IS NULL)`,
    ),
  }),
);

export const education = pgTable(
  "education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    institution: text("institution").notNull(),
    degree: text("degree").notNull(),
    fieldOfStudy: text("field_of_study"),
    startMonth: smallint("start_month").notNull(),
    startYear: smallint("start_year").notNull(),
    endMonth: smallint("end_month"),
    endYear: smallint("end_year"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("education_user_id_idx").on(table.userId),
    startMonthCheck: check(
      "education_start_month_check",
      sql`${table.startMonth} BETWEEN 1 AND 12`,
    ),
    endMonthCheck: check(
      "education_end_month_check",
      sql`${table.endMonth} IS NULL OR ${table.endMonth} BETWEEN 1 AND 12`,
    ),
    endDatePairCheck: check(
      "education_end_date_pair_check",
      sql`(${table.endMonth} IS NULL) = (${table.endYear} IS NULL)`,
    ),
  }),
);

export const certifications = pgTable(
  "certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    issuer: text("issuer").notNull(),
    issueMonth: smallint("issue_month"),
    issueYear: smallint("issue_year"),
    expirationMonth: smallint("expiration_month"),
    expirationYear: smallint("expiration_year"),
    credentialId: text("credential_id"),
    credentialUrl: text("credential_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("certifications_user_id_idx").on(table.userId),
    issueMonthCheck: check(
      "certifications_issue_month_check",
      sql`${table.issueMonth} IS NULL OR ${table.issueMonth} BETWEEN 1 AND 12`,
    ),
    issueDatePairCheck: check(
      "certifications_issue_date_pair_check",
      sql`(${table.issueMonth} IS NULL) = (${table.issueYear} IS NULL)`,
    ),
    expirationMonthCheck: check(
      "certifications_expiration_month_check",
      sql`${table.expirationMonth} IS NULL OR ${table.expirationMonth} BETWEEN 1 AND 12`,
    ),
    expirationDatePairCheck: check(
      "certifications_expiration_date_pair_check",
      sql`(${table.expirationMonth} IS NULL) = (${table.expirationYear} IS NULL)`,
    ),
  }),
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    month: smallint("month"),
    year: smallint("year"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("achievements_user_id_idx").on(table.userId),
    monthCheck: check(
      "achievements_month_check",
      sql`${table.month} IS NULL OR ${table.month} BETWEEN 1 AND 12`,
    ),
    datePairCheck: check(
      "achievements_date_pair_check",
      sql`(${table.month} IS NULL) = (${table.year} IS NULL)`,
    ),
  }),
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("skills_user_id_idx").on(table.userId),
    // Case-insensitive uniqueness (Phase 7 Stage 2 hotfix, migration 0008):
    // "React" and "react" must collide for the same user. A functional
    // unique index on lower(name) is the DB-level source of truth — the
    // stored `name` value itself keeps whatever casing the user typed.
    userIdNameLowerUnique: uniqueIndex("skills_user_id_name_lower_unique").on(
      table.userId,
      sql`lower(${table.name})`,
    ),
  }),
);
