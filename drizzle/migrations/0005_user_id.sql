-- user_id = Supabase auth user uuid (no cross-DB FK; local Postgres ≠ Supabase Auth)

TRUNCATE TABLE
  "application_status_history",
  "generated_documents",
  "applications",
  "matches",
  "search_runs",
  "profiles"
RESTART IDENTITY CASCADE;
--> statement-breakpoint

ALTER TABLE "profiles"
  ADD COLUMN "user_id" uuid NOT NULL;
--> statement-breakpoint

ALTER TABLE "applications"
  ADD COLUMN "user_id" uuid NOT NULL;
--> statement-breakpoint

ALTER TABLE "matches"
  ADD COLUMN "user_id" uuid NOT NULL;
--> statement-breakpoint

ALTER TABLE "generated_documents"
  ADD COLUMN "user_id" uuid NOT NULL;
--> statement-breakpoint

ALTER TABLE "search_runs"
  ADD COLUMN "user_id" uuid NOT NULL;
--> statement-breakpoint

CREATE INDEX "profiles_user_id_idx" ON "profiles" ("user_id");
--> statement-breakpoint
CREATE INDEX "applications_user_id_idx" ON "applications" ("user_id");
--> statement-breakpoint
CREATE INDEX "matches_user_id_idx" ON "matches" ("user_id");
--> statement-breakpoint
CREATE INDEX "generated_documents_user_id_idx" ON "generated_documents" ("user_id");
--> statement-breakpoint
CREATE INDEX "search_runs_user_id_idx" ON "search_runs" ("user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "profiles_one_active_per_user_idx"
  ON "profiles" ("user_id")
  WHERE "is_active" = true;
