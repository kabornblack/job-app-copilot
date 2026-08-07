import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  numeric,
  vector,
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

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
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
});

export const jobs = pgTable("jobs", {
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
});

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
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
});

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
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
});

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

export const generatedDocuments = pgTable("generated_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .notNull(),
  docType: text("doc_type").notNull(),
  content: text("content"),
  filePath: text("file_path"),
  promptVersion: text("prompt_version").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
