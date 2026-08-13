-- Expand plan/quota system from trial/trusted to free/pro/trusted (payg
-- reserved, no logic behind it yet). "trial" is renamed to "free" - it's a
-- permanent tier now (no expiry), not a countdown, so existing trial rows
-- become free rows rather than a separate coexisting concept.
--
-- Constraint must be dropped before the rename UPDATE below - the old
-- constraint only permits 'trial'/'trusted' and would reject 'free'.
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_plan_check";
--> statement-breakpoint
UPDATE "user_settings" SET "plan" = 'free' WHERE "plan" = 'trial';
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "plan" SET DEFAULT 'free';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_plan_check"
  CHECK ("plan" = ANY (ARRAY['free'::text, 'pro'::text, 'trusted'::text, 'payg'::text]));
--> statement-breakpoint

-- Editable-without-a-deploy quota numbers for free/trusted. Pro's numbers
-- are fixed code constants (QUOTA_LIMITS.pro in quota.ts) and deliberately
-- never have rows here - a paying user's allowance shouldn't silently
-- change under them. Same generic (key, key, value) shape as usage_counters
-- so it fits the existing convention rather than inventing a new one.
CREATE TABLE "quota_overrides" (
  "plan" text NOT NULL,
  "metric" text NOT NULL,
  "limit_value" integer NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("plan", "metric")
);
--> statement-breakpoint

INSERT INTO "quota_overrides" ("plan", "metric", "limit_value") VALUES
  ('free', 'search_weekly', 1),
  ('free', 'cv_gen_daily', 1),
  ('free', 'cover_letter_gen_daily', 1),
  ('free', 'score_calls_monthly', 40),
  ('trusted', 'search_daily', 2),
  ('trusted', 'score_calls_monthly', 100),
  ('trusted', 'cv_gen_monthly', 8),
  ('trusted', 'cover_letter_gen_monthly', 8);
