# ADR-0005: CV upload and generation-priority redesign

## Context

ADR-0004 introduced the profile-knowledge base (six `user_id`-scoped tables)
and stated that generation prompts would gain "a serialization step that
formats all of the above into structured context, replacing reliance on
`resume_summary` as the primary source" — filed as Phase 7 Stage 3 and left
unimplemented pending that work actually happening.

This ADR **supersedes ADR-0004's Stage 3 framing**. Rather than shipping the
structured-serialization prompt redesign alone, it's combined with a new
capability: users can optionally upload their real, existing CV as a PDF.
When present, that CV is the authoritative fact source for generation — not
just one more input alongside the structured profile-knowledge tables.
Real resumes carry nuance (phrasing, emphasis, exact wording an applicant
has already refined) that six normalized DB tables can't fully capture, and
forcing users to re-enter everything from an existing CV by hand is
needless friction.

## Decision

1. **New table `cv_uploads`** (1:1 per user, `user_id` primary key, no FK to
   Supabase `auth.users` — same no-cross-DB-FK convention as every ADR-0004
   table and every other `user_id`-scoped table in this schema). Columns:
   `file_path` (disk stem, same convention as `generated_documents.file_path`
   / `documents.ts`'s `absoluteDocumentPath`), `original_filename`,
   `extracted_text`, `extraction_status` (`ok` | `empty` | `failed`),
   `uploaded_at`, `updated_at`.
2. **New dependencies**: `pdf-parse` (PDF text extraction) and
   `@fastify/multipart` (this API had no multipart/form-data handling at
   all before this change). Raw PDF bytes are written to disk
   (`storage/uploads/{userId}/cv.pdf`, one fixed filename per user, so a
   re-upload replaces without any extra logic); the extracted text — the
   only part generation prompts actually read — lives in the DB row.
3. **Priority rule, always automatic, no per-job toggle**: when a user has
   an uploaded CV with `extraction_status: "ok"`, its extracted text is the
   authoritative fact source for CV/cover-letter generation. The structured
   profile-knowledge serialization (point 4) becomes secondary — used only
   to fill genuine gaps the uploaded CV doesn't cover, never to contradict
   or override it. When no CV is uploaded (or extraction produced no usable
   text), generation falls back to the original ADR-0004 Stage 3 design:
   the structured serialization is the sole fact source.
4. **`serializeProfileKnowledge`** (`services/api/src/lib/profile-serialization.ts`)
   formats the six ADR-0004 resources into one structured, human-readable
   text block (plain labeled sections, not JSON — matches the existing
   prompt's style). Used in both generation paths, per point 3.
   `resume_summary` / `personal_details.professional_summary` is
   demoted to a labeled "framing/tone only, not a fact source" section, per
   ADR-0004's original intent — it never contributes fact content in either
   path.
5. Routes: `PUT` / `GET` / `DELETE /profile/cv`, following the exact
   upsert/fetch/delete convention `/profile/personal-details` already uses.
   UI lives at the top of the existing Personal Info tab — no new tab.

## Consequences

- Prompt size grows further beyond ADR-0004's own estimate when a CV is
  attached: a typical resume runs roughly 500–1,600 tokens as plain text on
  top of the structured serialization, versus the original bare
  skills/roles/locations/summary block (~100–200 tokens). Cost impact is
  real (a real multiplier on the ADR-0004 Stage 3 estimate) but small in
  absolute terms on current per-token pricing, and is bounded by the
  existing scoring/generation quota system, not a new spend risk.
- `pdf-parse` extracts a PDF's text layer only — a scanned/image-only PDF
  with no text layer extracts to nothing (`extraction_status: "empty"`).
  This is a known limitation of general-purpose PDF text extraction, not
  specific to this library; the UI surfaces it rather than silently
  generating from an empty CV.
- `pdf-parse` v2's `getText()` defaults to inserting a `-- N of M --`
  per-page footer marker into the concatenated text (confirmed by reading
  its source, not assumed) — explicitly suppressed via `pageJoiner: "\n\n"`
  in `extractPdfText` so it never reaches the generation prompt.
- DOCX upload is explicitly out of scope — PDF only, per the settled design.
- No per-job override of the priority rule exists. If a user's uploaded CV
  is stale relative to their profile-knowledge data, generation will still
  treat the (stale) CV as authoritative until they replace it. Accepted
  tradeoff, not a bug to "fix" later with a toggle.
