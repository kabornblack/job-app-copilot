-- Phase 7 Stage 2 hotfix: "React" and "react" saved as two separate skills
-- for the same user is wrong. Replace the case-sensitive
-- UNIQUE(user_id, name) constraint from 0007 with a unique index on
-- (user_id, lower(name)) so case-variant duplicates are rejected at the DB
-- level (not just by an application-level check, which alone would still
-- leave a race-condition window for two case-variant duplicates to both
-- succeed).
ALTER TABLE "skills" DROP CONSTRAINT "skills_user_id_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_id_name_lower_unique" ON "skills" (user_id, lower(name));
