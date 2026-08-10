-- Per-user plan (trial | trusted) + usage counters for search/doc-gen quotas

CREATE TABLE "user_settings" (
  "user_id" uuid PRIMARY KEY,
  "plan" text NOT NULL DEFAULT 'trial',
  "trial_started_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_settings_plan_check" CHECK ("plan" IN ('trial', 'trusted'))
);
--> statement-breakpoint

CREATE TABLE "usage_counters" (
  "user_id" uuid NOT NULL,
  "metric" text NOT NULL,
  "period_start" date NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  CONSTRAINT "usage_counters_count_check" CHECK ("count" >= 0),
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("user_id", "metric", "period_start")
);
--> statement-breakpoint

CREATE INDEX "usage_counters_user_id_idx" ON "usage_counters" ("user_id");
