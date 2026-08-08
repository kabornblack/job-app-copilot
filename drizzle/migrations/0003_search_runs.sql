CREATE TYPE "search_run_status" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);
--> statement-breakpoint
CREATE TYPE "search_run_trigger" AS ENUM (
  'manual',
  'cron'
);
--> statement-breakpoint
CREATE TABLE "search_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL,
  "trigger" "search_run_trigger" NOT NULL,
  "status" "search_run_status" DEFAULT 'queued' NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_runs"
  ADD CONSTRAINT "search_runs_profile_id_profiles_id_fk"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "search_runs_profile_id_created_at_idx"
  ON "search_runs" ("profile_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "search_runs_status_idx"
  ON "search_runs" ("status");
