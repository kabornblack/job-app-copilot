CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "job_source_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "url" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_source_listings"
  ADD CONSTRAINT "job_source_listings_job_id_jobs_id_fk"
  FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_source_listings"
  ADD CONSTRAINT "job_source_listings_source_external_id_unique"
  UNIQUE ("source", "external_id");
--> statement-breakpoint
CREATE INDEX "job_source_listings_job_id_idx"
  ON "job_source_listings" ("job_id");
--> statement-breakpoint
INSERT INTO "job_source_listings" ("job_id", "source", "external_id", "url", "first_seen_at")
SELECT "id", "source", "external_id", "url", "ingested_at"
FROM "jobs";
--> statement-breakpoint
-- Hash as bytea with 0x00 separators (Postgres text cannot contain NUL).
-- Must match Node: sha256(utf8(title) + \0 + utf8(company) + \0 + utf8(location)).
UPDATE "jobs"
SET "fingerprint" = encode(
  digest(
    convert_to(lower(trim(regexp_replace("title", '\s+', ' ', 'g'))), 'UTF8')
      || '\000'::bytea
      || convert_to(lower(trim(regexp_replace("company", '\s+', ' ', 'g'))), 'UTF8')
      || '\000'::bytea
      || convert_to(
        lower(trim(regexp_replace(coalesce("location", ''), '\s+', ' ', 'g'))),
        'UTF8'
      ),
    'sha256'
  ),
  'hex'
);
--> statement-breakpoint
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_source_external_id_unique"
  UNIQUE ("source", "external_id");
--> statement-breakpoint
CREATE INDEX "jobs_fingerprint_idx" ON "jobs" ("fingerprint");
