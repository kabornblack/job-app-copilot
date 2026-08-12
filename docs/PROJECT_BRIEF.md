# Project brief: job application automation tool

## 1. What this is

A full-stack tool that finds job listings matching my profile, scores/ranks them with an
explanation, generates a tailored CV and cover letter per job, and tracks applications
through their lifecycle. It is both a daily-use tool and a portfolio piece, alongside an
existing project, Stay Loyal (a Solana-based loyalty platform).

**Non-negotiable design principle:** this tool never submits applications automatically.
Every generated CV/cover letter goes into a review queue for explicit human approval
before anything is sent anywhere. See ADR-0002.

## 2. Background / stack

- Full-stack engineer, Tallinn, Estonia
- Stack: React, TypeScript, Next.js, Node.js/Fastify, PostgreSQL, Supabase, Docker,
  GitHub Actions CI/CD
- New to this project specifically: BullMQ/Redis background job processing,
  pgvector semantic search, Sentry observability
- Practice: formal ADRs for major decisions, unit/integration tests as standard,
  not just for CRUD but for the AI pipeline logic too
- Portfolio: www.kabiru.dev

## 3. What it does

1. Takes profile/preferences as input: skills, target roles, locations, salary range,
   remote preference
2. Searches job board APIs (Adzuna primary, Jooble secondary) and pulls new listings daily
3. Scores/ranks each job against the profile using the Claude API, with a clear
   explanation of why it's a match
4. Auto-generates a tailored CV and cover letter per job (docx + PDF)
5. Presents a review queue for approval before anything is submitted — never fully
   automated submission
6. Tracks application status over time: found → tailored → applied → interview → outcome

## 4. Architecture

```
                         ┌─────────────────┐
                         │  Cron scheduler  │
                         │  (daily trigger) │
                         └────────┬─────────┘
                                  │
   ┌──────────────────────────── │ ───────────────────────────┐
   │  Your app (Docker Compose)  ▼                             │
   │  ┌──────────────────┐   ┌─────────────────────┐           │
   │  │ Next.js dashboard │──▶│     Fastify API      │           │
   │  │ Review & tracking │   │ Auth & orchestration │           │
   │  └──────────────────┘   └──────────┬──────────┘           │
   │                                    │                       │
   │  ┌──────────────────┐   ┌──────────▼──────────┐           │
   │  │  BullMQ + Redis   │   │ Postgres + pgvector  │           │
   │  │  Job scheduling   │   │  Data + embeddings    │           │
   │  └────────┬──────────┘   └──────────▲──────────┘           │
   │           │                          │                      │
   │  ┌────────▼──────────────────────────┴─────────┐           │
   │  │            Background workers                │──┐        │
   │  │     Scraper, matcher, doc generator           │  │        │
   │  └────────────────────────────────────────────────┘  │        │
   └────────────────────────────────────────────────────── │ ──────┘
                                                              │
                     ┌──────────────┬───────────────┬────────┘
                     ▼              ▼               ▼
              ┌────────────┐ ┌────────────┐ ┌────────────┐
              │  Job APIs  │ │ Claude API │ │   Sentry   │
              │ Adzuna,    │ │ Scoring &  │ │   Error    │
              │ Jooble     │ │   docs     │ │  tracking  │
              └────────────┘ └────────────┘ └────────────┘
```

Key relationships:

- Cron enqueues a daily `scrape` job on BullMQ
- Workers consume `scrape` → `match` → `generate-docs` jobs, each idempotent and retryable
- Matching (cheap, runs on every listing) is a separate job type from document generation
  (expensive, only runs after human approval in the review queue) — do not collapse these
- Postgres holds both relational data and pgvector embeddings; no separate vector DB
- Sentry instruments the API and every worker, not just the frontend

## 5. Postgres schema (Drizzle ORM)

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  version int not null default 1,
  skills text[] not null default '{}',
  target_roles text[] not null default '{}',
  locations text[] not null default '{}',
  salary_min int,
  salary_max int,
  currency text default 'EUR',
  remote_pref text check (remote_pref in ('remote', 'hybrid', 'onsite', 'any')),
  resume_summary text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  fingerprint text not null,
  title text not null,
  company text not null,
  location text,
  remote_type text,
  salary_min int,
  salary_max int,
  description text,
  url text not null,
  posted_at timestamptz,
  ingested_at timestamptz not null default now(),
  embedding vector(1536),
  unique (source, external_id)
);
create index jobs_fingerprint_idx on jobs (fingerprint);
create index jobs_posted_at_idx on jobs (posted_at desc);
create index jobs_embedding_idx on jobs using hnsw (embedding vector_cosine_ops);

create table matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  score numeric(4,1) not null,
  explanation text not null,
  semantic_similarity numeric(5,4),
  model_version text not null,
  scored_at timestamptz not null default now(),
  unique (job_id, profile_id)
);

create type application_status as enum (
  'found', 'reviewing', 'tailored', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  match_id uuid references matches(id),
  status application_status not null default 'found',
  cv_document_id uuid,
  cover_letter_document_id uuid,
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  status application_status not null,
  changed_at timestamptz not null default now(),
  note text
);

create table generated_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  doc_type text not null check (doc_type in ('cv', 'cover_letter')),
  file_path text not null,
  prompt_version text not null,
  generated_at timestamptz not null default now()
);
```

Design decisions behind this schema (each should get its own ADR when implemented):

- **Profile versioning**: preferences change over time; bump `version` and insert a new
  row rather than mutating in place, so past matches stay explainable against the profile
  that produced them.
- **Fingerprint-based dedup**: normalized hash of title+company+location catches
  cross-source duplicates (same job on Adzuna and Jooble) without fuzzy matching yet.
- **`semantic_similarity` kept separate from `score`**: lets us evaluate whether the
  pgvector signal is pulling its weight independent of Claude's judgment.

## 6. Job board APIs

- **Adzuna** (primary): ~1,000 free calls/month, licensed data, cleanest ToS for personal
  use. Must route all queries through Adzuna directly — never contact a third-party
  content provider it names.
- **Jooble** (secondary): free API key via request form, strong EU/Estonia coverage, no
  documented hard rate cap for standard use.
- Do not scrape job boards directly (LinkedIn, Indeed) under any circumstances — API-only.

## 7. Build phases

**Phase 0 — Foundations**: repo scaffold, Docker Compose (Postgres+pgvector, Redis),
CI (lint/typecheck/test on PRs), ADR-0001 (architecture) and ADR-0002 (review-gate,
never auto-submit).

**Phase 1 — MVP**: profile input, Adzuna integration (synchronous, no queue yet),
rule-based scoring, single Claude call for CV/cover letter as plain text, review queue UI
end to end.

**Phase 2 — Real matching + real documents**: Claude-based scoring with structured
match score + explanation, pgvector embeddings as a second signal, docx/PDF generation,
full status tracker.

**Phase 3 — Background processing + scheduling**: move scraping/matching/doc-gen onto
BullMQ workers, add the daily repeatable cron job, idempotency and retry tests.

**Phase 4 — Observability + hardening**: Sentry on API and workers, Bull Board for queue
visibility, structured logging, AI pipeline test coverage (prompt regression tests,
scoring consistency), not just CRUD tests.

**Phase 5 — Second source + polish**: add Jooble, cross-source dedup logic.

Do not start a phase until the previous one is reviewed and explicitly approved.

## 8. Working agreement — what Claude should not do without asking first

This project is run the way I'd run a professional engineering environment: plans get
reviewed before execution, and certain actions always require an explicit go-ahead
regardless of how routine they seem.

**Always ask before:**

- COMPULSORY — no fabricated user accounts, ever: never create a Supabase Auth
  user for testing purposes, under any circumstance — not via signup, not via
  admin.createUser, not with @example.com or any other domain, regardless of
  task type or how routine the test seems. This overrides any prior guidance
  that permitted @example.com + admin.createUser. When a task needs an
  authenticated user to verify: give me the exact curl command(s) or browser
  steps to run myself, using my own real account; I will test manually and
  bring back the real output (I am always willing to do this — asking is
  never a blocker, treat it as the default path, not a fallback); do not
  proceed past a point that requires a new/different user account without
  stopping and asking first
- Committing or pushing to any remote branch, including `main` — I commit, or I
  explicitly tell you to
- Creating or switching to any per-phase feature branches; this repository uses only
  `main` and `develop` branches, and work happens directly on `develop`
- Installing a new dependency that wasn't already listed in this brief or a prior
  approved plan — list what you want to add and why, then wait
- Running any migration against a non-local database
- Deleting or overwriting existing files outside the current task's scope
- Modifying `.env`, CI/CD secrets, GitHub Actions permissions, or any deployment config
- Making an architectural decision not already covered in this brief (e.g. changing the
  ORM, adding a new external service, changing the queue library) — propose it as an ADR
  draft first
- Any refactor touching more than ~5 files at once — describe the change and the files
  affected before starting
- Marking a task "done" when tests are failing, or skipping/weakening a test to make it pass

**Always do without asking:**

- Read files, run the existing test suite, run linters/typecheckers, search the repo
- Propose a plan for a requested task before writing code
- Draft ADRs for review (drafts only — I approve before they're considered final)
- Write and run tests for code you just wrote

**Standing rules:**

- No fully automated job application submission, ever, under any framing
- No scraping job boards directly — API access only, respecting each provider's ToS
- Every phase starts with a short plan (files/folders, package choices, migration
  strategy) that I confirm before implementation begins
- Every ADR follows Context / Decision / Consequences and lives in `docs/adr/NNNN-title.md`
- If something in this brief turns out to be wrong or outdated once we're building, flag
  the conflict explicitly rather than silently working around it
