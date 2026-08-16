-- ADR-0006: admin access + trusted-plan invites.

ALTER TABLE "user_settings" ADD COLUMN "is_admin" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE "trusted_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "token" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "revoked_at" timestamptz,
  CONSTRAINT "trusted_invites_token_unique" UNIQUE ("token")
);
--> statement-breakpoint

CREATE INDEX "trusted_invites_email_idx" ON "trusted_invites" (lower("email"));
