-- Phase 7 Stage 3 / ADR-0005: optional uploaded CV, 1:1 per user. Same
-- no-FK-to-auth.users convention as personal_details and every other
-- profile-knowledge table (migration 0007) - this DB is local Docker
-- Postgres, auth.users lives in Supabase-hosted Postgres.

CREATE TABLE "cv_uploads" (
  "user_id" uuid PRIMARY KEY,
  "file_path" text NOT NULL,
  "original_filename" text,
  "extracted_text" text NOT NULL,
  "extraction_status" text NOT NULL DEFAULT 'ok',
  "uploaded_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
