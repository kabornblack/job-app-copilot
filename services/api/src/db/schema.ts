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
  numeric,
  vector,
  jsonb,
  unique,
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

export const userPlanEnum = ["trial", "trusted"] as const;
export type UserPlan = (typeof userPlanEnum)[number];

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  plan: text("plan").notNull().default("trial"),
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
