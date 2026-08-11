# Job Application Copilot

A full-stack tool that finds job listings matching your profile, scores and
explains each match with AI, drafts a tailored CV and cover letter you can
edit, and tracks every application through its lifecycle.

**This tool never submits applications automatically.** Every generated CV
and cover letter goes into a review queue for explicit human approval —
you always click "Apply" yourself, on the company's own site. See
[ADR-0002](docs/adr/0002-review-gate-not-auto-submit.md) for the reasoning.

## What it does

1. **Profile intake** — skills, target roles, locations, salary range, remote preference
2. **Multi-source search** — pulls listings from Adzuna (primary) and Jooble (secondary), deduped across sources by a title+company+location fingerprint
3. **AI scoring** — Claude scores each listing 0–100 against your profile with a plain-language explanation of *why*; a separate pgvector semantic-similarity signal is tracked independently for evaluation, not blended into the score
4. **Tailored documents** — generates a draft CV and cover letter per job (Claude), editable in a rich-text editor before export to DOCX/PDF
5. **Review queue** — every match and document sits in a review queue (To review / Applied / Archived) until you explicitly act on it
6. **Application tracking** — full status lifecycle: `found → reviewing → tailored → applied → interviewing → offer/rejected/withdrawn`, with a history log per application
7. **Daily background refresh** — a scheduled worker re-runs search for each active profile once a day

The public landing page lives at `/`; `/login` and `/signup` handle auth;
signed-in users land on `/dashboard` (the review queue) and manage their
search criteria at `/profile`.

## Tech stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TipTap (rich-text editing), framer-motion
- **Backend**: Node.js, Fastify, TypeScript
- **Data**: PostgreSQL 16 + pgvector (relational data and embeddings in one database, no separate vector store), Drizzle ORM
- **Background jobs**: BullMQ + Redis (search and scoring run as retryable, idempotent jobs; document generation stays synchronous per [ADR-0003](docs/adr/0003-async-search-pipeline-bullmq.md))
- **Auth**: Supabase Auth (Next.js middleware + Fastify Bearer-JWT verification)
- **AI**: Claude API (scoring + document generation), OpenAI `text-embedding-3-small` (semantic similarity)
- **Job data**: Adzuna and Jooble APIs (no direct scraping, ever)
- **Observability**: Sentry (API + workers), Bull Board (queue visibility)
- **Infra**: Docker Compose (Postgres, Redis), pnpm workspaces monorepo

## Documentation — source of truth

This README is an overview. For anything authoritative, read these first:

- **[docs/PROGRESS.md](docs/PROGRESS.md)** — what's actually built and verified, phase by phase, plus known gotchas. Read this before touching code.
- **[docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)** — full product brief, architecture, schema, and working agreement.
- **[docs/adr/](docs/adr/)** — architecture decision records (review-gate design, async pipeline, etc.).

## Local setup

### Prerequisites

- Node.js (matching the version in `package.json`'s toolchain — this repo was built and tested on Node 24.x)
- pnpm (`packageManager` is pinned to `pnpm@11.4.0`)
- Docker (for Postgres + Redis via Docker Compose)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` at the repo root with real values (Adzuna, Jooble, Claude,
OpenAI, Supabase keys, etc. — see `.env.example` for the full list). The
web app also needs its own copy for `NEXT_PUBLIC_*` variables:

```bash
cp .env.example apps/web/.env.local
```

(then trim it down to just the `NEXT_PUBLIC_*` / Supabase values it needs).

### 3. Start Postgres + Redis

```bash
docker compose up -d
```

Postgres (with pgvector) runs on host port **5433**, not 5432 — a native
Postgres install often already occupies 5432 on dev machines, so don't be
surprised it's not the default port.

### 4. Run database migrations

```bash
pnpm exec tsx services/api/scripts/run-migrations.ts
```

Use this script, **not** `pnpm db:migrate` / the `drizzle-kit migrate`
CLI — the CLI hangs silently on some machines for unknown reasons even
with a correct connection string. `run-migrations.ts` calls Drizzle's
`migrate()` directly and is the verified-working path.

### 5. Start the app (three terminals)

```bash
# Terminal 1 — API
cd services/api && pnpm dev

# Terminal 2 — background worker (search + scoring jobs)
cd services/api && pnpm worker

# Terminal 3 — web app
cd apps/web && pnpm dev
```

Then open **http://localhost:3000**.

## Testing

```bash
pnpm test        # both workspaces (apps/web + services/api)
pnpm lint         # eslint across the whole repo
pnpm typecheck    # tsc --noEmit, both workspaces
```

Run a single workspace's suite with `pnpm --filter ./apps/web test` or
`pnpm --filter ./services/api test`.

## Git workflow

Two branches only: `main` and `develop`. All work happens on `develop`;
there are no per-feature branches. Merges to `main` happen when a phase of
work is reviewed and explicitly approved.

## Known limitations

- **Estonia has no direct job-board coverage.** Adzuna doesn't support
  Estonia as a market and falls back to `gb`; Jooble frequently returns
  zero results for "Tallinn" / "Estonia" queries. This is a documented
  limitation of the upstream APIs, not a bug — use a broader/supported
  location (e.g. "United Kingdom", "Berlin", "Remote") to get real results.
- **No `GET /profile` endpoint yet.** The API has no way to fetch "does
  this user have a profile" independently of running a search. The
  frontend works around this with a client-side heuristic (empty review
  queue ⇒ assume no profile yet) rather than a real backend check — see
  `apps/web/lib/profile-flag.ts` for the details and its known edge case.
- **Not yet deployed.** Everything above describes local development only;
  hosting (Railway/Render) and payment gating (Stripe) are still open
  items in `docs/PROGRESS.md`'s Phase 6.
