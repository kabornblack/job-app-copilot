# Progress tracker

Read this file at the start of every session, before docs/PROJECT_BRIEF.md and
before touching any code. It tells you exactly what is done, verified, and
safe to build on — versus what's still pending.

## Rules for using this file

- Only check an item `[x]` if it has been **verified with real output** —
  a real terminal log, a real curl response, a real browser test. Marking
  something done because code was written but not run is not allowed.
- When you complete and verify something, update this file yourself as part
  of that task — don't wait to be asked.
- If you're unsure whether something already works, don't assume either way —
  test it fresh and update this file with the real answer.
- Never delete history from this file. If something that was working breaks
  later, add a note under "Known issues," don't just uncheck it silently.

---

## Phase 0 — Foundations COMPLETE (merged to main)

- [x] pnpm workspace monorepo (apps/web, services/api)
- [x] Docker Compose: Postgres 16 + pgvector, Redis (host port 5433, not 5432
      - a native Windows Postgres service occupies 5432 on this machine)
- [x] Drizzle ORM schema: profiles, jobs, matches, applications,
      application_status_history, generated_documents
- [x] pgvector extension auto-enabled via docker-entrypoint-initdb.d
- [x] GitHub Actions CI: lint, typecheck, test on PRs
- [x] ADR-0001 (architecture), ADR-0002 (review-gate, never auto-submit)
- [x] No hardcoded credentials - .env-only, .env.example provided
- [x] Two-branch workflow (main + develop only, no per-phase feature branches)

## Phase 1 - MVP COMPLETE (merged to main)

- [x] Profile input form (skills, target roles, locations, salary, remote pref)
- [x] Real Adzuna integration - country code derived from profile location,
      defaults to gb when location isn't a supported Adzuna market (Estonia
      is NOT supported directly - documented limitation, not a bug)
- [x] Rule-based scoring (keyword/skill overlap), stored with model_version
      = "rule-based-v1"
- [x] Review queue UI - lists scored jobs, approve/reject updates status
- [x] Separate CV and cover letter generation via Claude API
      (POST /applications/:applicationId/generate, type: "cv" | "cover_letter")
- [x] GET /applications/review-queue returns both generatedCV and
      generatedCoverLetter per application via a dual Drizzle alias() join
- [x] Verified end-to-end in browser: real Adzuna jobs -> real scores -> real
      Claude-generated CV and cover letter, both rendering correctly

### Known issues / gotchas from Phase 0-1 (don't re-debug these blind)

- Local Postgres runs on host port 5433, not 5432 - a native
  postgresql-x64-15 Windows service occupies 5432 on this machine
- drizzle-kit migrate (the CLI) hangs silently on this machine for unknown
  reasons even with a correct connection - migrations are run via
  services/api/scripts/run-migrations.ts (calls Drizzle's migrate() directly),
  not the CLI. Use: pnpm exec tsx services/api/scripts/run-migrations.ts
- .env is required - docker-compose.yml and drizzle.config.ts read from it
  via dotenv/config, no hardcoded fallbacks
- Drizzle version in this project does NOT support .maybeTake() (that's
  Kysely) or .orderBy(column, "desc") - use .limit(1) + array destructuring,
  and .orderBy(desc(column)) with desc imported from drizzle-orm
- Claude API calls use /v1/messages, NOT the deprecated /v1/complete endpoint
  - response text is at response.content[0].text
- Embeddings use OpenAI `text-embedding-3-small` via OPENAI_API_KEY (not Claude);
  OpenAI billing/credits must be available or /jobs/search returns 500 on embed
- Adzuna can occasionally return `count: 0` for a query that worked earlier —
  retry with a broader supported-market location (e.g. London) before debugging
  the search pipeline
- Re-search dedup: unchanged profile reuses the active `profiles` row; existing
  `(jobId, profileId)` matches skip Claude re-scoring. Verified: identical
  re-search → `claudeCalls: 0`, `matchesReused: 20`, `applicationsCreated: 0`
- Claude scoring explanations can exceed short limits — Zod max is 2000 chars;
  prompt asks for 2-4 short sentences
- After rotating CLAUDE_API_KEY, fully restart the API process (tsx watch does
  not reload .env)
- Generated docs live under `services/api/storage/` (gitignored); `file_path`
  is a relative stem, not a full absolute path
- Document review flow: generate stores `content` + `content_json` and sets
  `file_path` to null; Save persists TipTap JSON; Download writes docx/pdf from
  saved `content_json` and only then sets `file_path`. PDFKit compresses text
  (FlateDecode + hex TJ) — raw string search on .pdf bytes can false-negative

---

## Phase 2 - Real matching + real documents - IN PROGRESS

- [x] pgvector embeddings generated for jobs and profile
      - OpenAI `text-embedding-3-small` (1536 dims, matches `jobs.embedding`)
      - Job embedding persisted on insert/backfill in `POST /jobs/search`
      - Profile embedding computed at search time (not persisted)
      - Verified: job row with non-null embedding (`vector_dims` = 1536) and
        match rows with non-null `semantic_similarity` (e.g. 0.6321) via curl + SQL
- [x] Semantic similarity stored as its own column (matches.semantic_similarity),
      kept separate from the rule-based/Claude score - do not merge these
      into one number
- [x] Claude-based scoring replacing/augmenting rule-based-v1, with
      structured explanation output
      - Forced tool_use `score_job_match` → `{ score: 0-100 int, explanation }`
      - Stored as `matches.score` with `model_version = claude-sonnet-4-6-v1`
      - Rule-based kept in `score.ts`, returned as `ruleBasedScore` on search
        response only (not persisted); `semantic_similarity` still separate
      - Verified differentiation e.g. scores 18 / 42 / 85 with distinct
        explanations; re-search skips Claude when matches already exist
- [x] Real docx generation for CV and cover letter (populate
      generated_documents.file_path)
      - `docx` package; files under `services/api/storage/generated/{applicationId}/`
      - `file_path` stores stem e.g. `storage/generated/{id}/cv`
      - Download: `GET /applications/:id/documents/:docType/download?format=docx|pdf`
      - Frontend Download DOCX/PDF buttons in GeneratedTextPanel
      - Verified non-empty files (e.g. cv.docx 9636 bytes, cv.pdf 3078 bytes),
        readable text extracted from both formats, browser download opened
- [x] Real PDF generation (same)
      - `pdfkit`; sibling `.pdf` next to `.docx` from the same stem
- [x] TipTap review-and-edit before download
      - `content_json` jsonb on `generated_documents` (migration 0002)
      - TipTap StarterKit constrained to h1/h2, paragraph, bold, italic, bullets
      - Generate seeds TipTap JSON via adapted `parseDocumentBlocks`; no file write
      - PATCH save; download builds docx/pdf from saved JSON
      - Verified marker `EDITED_MARKER_xyz_7841` survived into downloaded DOCX
        and PDF after edit+save (not the original Claude draft)
- [x] Full status tracker UI reflecting the complete lifecycle (found ->
      reviewing -> tailored -> applied -> interviewing -> offer/rejected/withdrawn)
      - `PATCH /applications/:id/status` inserts `application_status_history` on
        real status changes; sets `applications.applied_at` on first `applied`
      - JobCard: status badge; “Apply on {company}'s site” → real job URL;
        pre-application Approve/Reject/Generate + “Mark as applied” when docs
        exist; post-application muted card + lifecycle select only
      - ReviewQueue client tabs: To review / Applied / Archived with counts
      - Verified app `fa6ec9a2-041a-4288-93a1-292a0df2df68` (Ebury Adzuna URL):
        transitions applied → interviewing → offer produced 3 history rows;
        noop same-status PATCH did not insert; `applied_at` set once and kept

## Phase 3 - Background processing + scheduling - COMPLETE

- [x] Move search/scoring onto BullMQ workers (doc-gen stays sync per ADR-0003)
      - `bullmq` + `ioredis`; worker at `services/api/src/worker.ts`
      - Jobs: `search-run` → fan-out `score-match` using `ingestJobsForProfile` /
        `scoreMatchForJob` (same libs as former sync path)
      - `POST /jobs/search` → `202 { runId }`; `GET /search-runs/:id` for poll
      - `search_runs` table + enums applied (migration 0003); status
        queued → running → completed/failed with stats counters
      - UI: Search → “Searching...” → poll → refresh review queue
      - Browser-verified: complete message “20 jobs seen…”, review queue cards
        present (e.g. first title “Senior Lead Fullstack AI Engineer”)
- [x] Daily repeatable cron job for scraping
      - BullMQ `upsertJobScheduler('daily-search-run', 0 6 * * * Europe/Tallinn)`
        at worker startup (idempotent; `getJobSchedulers` shows one entry)
      - Tick calls `enqueueCronSearchIfActiveProfile` → `search_runs.trigger=cron`
        or no-op if no active profile
      - Verified: scheduler key `daily-search-run`; cron run
        `a69bab92-9bcc-4466-b018-bbcdbbff2d8b` completed with 20/20 scores
- [x] Idempotency + retry tests for worker jobs
      - `job-search.idempotency.test.ts`: re-score skips Claude / no duplicate
        match or application; simulated crash+retry leaves one row each
      - Full API suite: 14 tests passed

## Phase 4 - Observability + hardening - IN PROGRESS

- [x] Sentry on API and workers
      - `@sentry/node`; shared `lib/sentry.ts`; `initSentry("api"|"worker")`
      - Env: `SENTRY_DSN`, optional `SENTRY_ENVIRONMENT`
      - Fastify `setErrorHandler` captures 5xx; BullMQ `failed` handler captures
        with jobName/jobId + sanitized payload (no embeddings)
      - Provider failures tagged `claude` / `adzuna` / `openai`
      - Verified: GET `/debug/sentry-test` → event id
        `d4447060da4a4cb08284d1041b863c71` (check Sentry Issues UI)
- [x] Bull Board for queue visibility
      - `@bull-board/api` + `@bull-board/fastify`; adapter
        `@bull-board/api/bullMQAdapter`
      - Mounted at `/admin/queues` only when `BULL_BOARD_USER` +
        `BULL_BOARD_PASSWORD` are set; otherwise logged as disabled
      - Loopback-only (`403` off-localhost) + HTTP basic auth (`401` without)
      - Verified: unauthenticated → `401 Unauthorized`; with basic auth →
        `200` HTML UI; `/admin/queues/api/queues` shows `pipeline` queue
        (e.g. completed: 85, delayed: 1, `hasWorkers: true`,
        `jobSchedulerCount: 1`)
- [x] AI pipeline test coverage (prompt regression, scoring consistency)
      - Claude score Zod: invalid/non-object/missing/empty explanation,
        float score, string `"80"` rejected; missing `score_job_match`
        tool_use throws (mocked fetch)
      - Embeddings: OpenAI 500 throws; wrong/missing dims throw; happy-path
        returns 1536 numbers (mocked fetch)
      - TipTap seed: empty/whitespace → empty doc; no headings; bullets-only;
        12k paragraph preserved; mixed `#`/`##`/bullets
      - Verified: `pnpm --filter ./services/api test` → 8 files, 29 tests passed

## Phase 5 - Second source + polish - IN PROGRESS

- [x] Jooble integration
      - `lib/jooble.ts` (parse + `searchJooble`), `JOOBLE_API_KEY`
      - Int64 ids quoted before `JSON.parse` (JS Number precision)
      - Live proof: United Kingdom query returned jobs (e.g. Insight /
        Senior ITAM Pre-Sales Consultant); Tallinn/Estonia often
        `totalCount: 0` on Jooble — use a broader location when proving
- [x] Cross-source dedup logic
      - Shared `computeJobFingerprint` (title+company+location, no
        externalId); migration `0004` recomputed fingerprints via
        pgcrypto `bytea` (Postgres text cannot hold NUL)
      - `job_source_listings` junction + `unique(source, external_id)` on
        jobs and listings; `jobs_fingerprint_idx`
      - `upsertJobFromListing`: (source, external_id) → fingerprint →
        insert; parallel Adzuna+Jooble ingest with partial-failure
      - Verified collision: real Jooble listing + Adzuna twin same
        title/company/location → one `jobs` row
        (`b4c144a8-d077-4502-a405-d854ca9fc907`), two listings
        (adzuna + jooble), `fingerprintMatched: true` on second upsert

### Phase 5 gotchas

- Jooble location "Tallinn" / "Estonia" can return zero hits; "United
  Kingdom" / "Berlin" / empty return results
- Fingerprint SQL recompute must use `convert_to(...) || '\000'::bytea`,
  not `E'\0'` in text

## Phase 6 — Multi-tenant conversion — IN PROGRESS

Converts the app from single-user local tool to a small multi-user product
for a closed group (~5 friends), one-time-fee access.

- [x] Supabase Auth wired into Next.js (login/signup) and Fastify (verify
      session/JWT on protected routes)
      - Web: `@supabase/ssr` + `@supabase/supabase-js`; `/login`, `/signup`;
        middleware redirects unauthenticated `/` → `/login`
      - API: global `onRequest` `requireSupabaseAuth`; Bearer JWT via
        `supabase.auth.getUser`; public: `/health`, OPTIONS, Bull Board,
        `/debug/sentry-test`
      - Client `apiFetch` attaches `Authorization: Bearer <access_token>`
      - Env: `SUPABASE_*` + `NEXT_PUBLIC_SUPABASE_*` (also `apps/web/.env.local`)
      - Verified: real signup user `e80f036c-a6da-468e-9844-dc2cc1e9e683`;
        login session (token len 828); `GET /applications/review-queue`
        without auth → `401 {"error":"Unauthorized"}`; with Bearer → `200`
        queue JSON; browser `GET /` → `307 Location: /login`; `/login` and
        `/signup` return 200 with forms
- [x] Migration: add user_id to applications, matches, generated_documents,
      profiles (jobs table stays shared/global — listings aren't per-user)
      - Migration `0005_user_id`: wipe user-owned tables; add `user_id uuid
        NOT NULL` (no cross-DB FK to Supabase auth.users); also on
        `search_runs`; unique one active profile per user
- [x] Every existing route filtered by authenticated user_id — audit all
      of index.ts, not just new routes
      - `resolveActiveProfile(profile, userId)`; inserts set `user_id`;
        all SELECT/UPDATE in `index.ts` scoped; worker scoring inherits
        from profile; cron enqueues every active profile
      - Verified two users: A `865be73b-…` / B `f3839968-…`; A queue only
        `a1bca142-…` (Alpha); B queue only `bda4a49c-…` (Beta); B PATCH A’s
        applicationId → `404 {"error":"Application not found"}`; A PATCH
        own → `200` status reviewing
- [ ] Per-user usage quotas (daily search cap, monthly doc-gen cap) to
      protect shared API keys (Adzuna/Claude/OpenAI) from runaway cost
      across multiple users
- [ ] Deploy to Railway or Render — real hosting, Postgres + Redis + API +
      worker + web, before payments go live
- [ ] Stripe one-time payment gating access (not subscription for v1)

Order matters: auth → data isolation → quotas → deployment → payments.
Don't add payments before the app is safely multi-tenant and hosted.

### Phase 6 gotchas

- `SUPABASE_URL` must be the project root (`https://xxx.supabase.co`), not
  `/rest/v1/` — Auth returns "Invalid path" otherwise
- Supabase "Confirm email" is ON in this project — signup may not return a
  session until confirmed (disable Confirm email for smoother local UX, or
  confirm via Admin API)
- Anon signup hits email rate limits / bounce flags quickly — for scripts use
  `admin.createUser` + `email_confirm: true` and `@example.com` only (never
  fake gmail/outlook addresses). Real-user signup UX: disable Confirm email
  locally, or use a real inbox you control
- Next must stay on port 3000; if 3000 is busy it steals 3001 from the API
- `user_id` is uuid-only (no FK to Supabase `auth.users`) — app DB is local
  Docker Postgres, Auth is hosted Supabase
- Multi-tenant wipe in `0005` truncated profiles/apps/matches/docs/search_runs;
  shared `jobs` kept

- [ ] Switch from Supabase's default email sender to a custom SMTP provider
      (Resend) once a custom domain is available — needed before scaling
      beyond the initial small friend group, to avoid shared-reputation
      bounce/deliverability issues

## How to start everything

1. docker compose up -d (repo root)
2. Terminal 1: cd services/api; pnpm dev
3. Terminal 2: cd services/api; pnpm worker
4. Terminal 3: cd apps/web; pnpm dev
5. Open http://localhost:3000