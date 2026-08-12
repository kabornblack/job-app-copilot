-- Phase 7 / ADR-0004: profile knowledge base for document generation.
-- Six user_id-scoped tables (no FK to Supabase auth.users, matching the
-- existing pattern), none versioned like profiles. Date columns are
-- month/year granularity only across all four dated tables.

CREATE TABLE "personal_details" (
  "user_id" uuid PRIMARY KEY,
  "full_name" text,
  "email" text,
  "phone" text,
  "location" text,
  "linkedin_url" text,
  "portfolio_url" text,
  "professional_summary" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "work_experience" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "company" text NOT NULL,
  "title" text NOT NULL,
  "location" text,
  "start_month" smallint NOT NULL,
  "start_year" smallint NOT NULL,
  "end_month" smallint,
  "end_year" smallint,
  "bullets" text[] NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "work_experience_start_month_check" CHECK ("start_month" BETWEEN 1 AND 12),
  CONSTRAINT "work_experience_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
  CONSTRAINT "work_experience_end_date_pair_check" CHECK (("end_month" IS NULL) = ("end_year" IS NULL))
);
--> statement-breakpoint

CREATE INDEX "work_experience_user_id_idx" ON "work_experience" ("user_id");
--> statement-breakpoint

CREATE TABLE "education" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "institution" text NOT NULL,
  "degree" text NOT NULL,
  "field_of_study" text,
  "start_month" smallint NOT NULL,
  "start_year" smallint NOT NULL,
  "end_month" smallint,
  "end_year" smallint,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "education_start_month_check" CHECK ("start_month" BETWEEN 1 AND 12),
  CONSTRAINT "education_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
  CONSTRAINT "education_end_date_pair_check" CHECK (("end_month" IS NULL) = ("end_year" IS NULL))
);
--> statement-breakpoint

CREATE INDEX "education_user_id_idx" ON "education" ("user_id");
--> statement-breakpoint

CREATE TABLE "certifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "issuer" text NOT NULL,
  "issue_month" smallint,
  "issue_year" smallint,
  "expiration_month" smallint,
  "expiration_year" smallint,
  "credential_id" text,
  "credential_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "certifications_issue_month_check" CHECK ("issue_month" IS NULL OR "issue_month" BETWEEN 1 AND 12),
  CONSTRAINT "certifications_issue_date_pair_check" CHECK (("issue_month" IS NULL) = ("issue_year" IS NULL)),
  CONSTRAINT "certifications_expiration_month_check" CHECK ("expiration_month" IS NULL OR "expiration_month" BETWEEN 1 AND 12),
  CONSTRAINT "certifications_expiration_date_pair_check" CHECK (("expiration_month" IS NULL) = ("expiration_year" IS NULL))
);
--> statement-breakpoint

CREATE INDEX "certifications_user_id_idx" ON "certifications" ("user_id");
--> statement-breakpoint

CREATE TABLE "achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "month" smallint,
  "year" smallint,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "achievements_month_check" CHECK ("month" IS NULL OR "month" BETWEEN 1 AND 12),
  CONSTRAINT "achievements_date_pair_check" CHECK (("month" IS NULL) = ("year" IS NULL))
);
--> statement-breakpoint

CREATE INDEX "achievements_user_id_idx" ON "achievements" ("user_id");
--> statement-breakpoint

CREATE TABLE "skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "skills_user_id_name_unique" UNIQUE ("user_id", "name")
);
--> statement-breakpoint

CREATE INDEX "skills_user_id_idx" ON "skills" ("user_id");
