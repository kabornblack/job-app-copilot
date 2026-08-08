# ADR-0003: Async search pipeline via BullMQ

## Context

Phase 2 completed a working synchronous search path: `POST /jobs/search` calls
Adzuna, generates embeddings, scores matches with Claude, and creates
applications in a single HTTP request. That path is correct functionally but
blocks the API for tens of seconds to minutes and cannot support a daily
scheduled search without holding open a request.

Document generation (`POST /applications/:id/generate`) is a single Claude call
triggered while the user is already waiting in the editor. Queuing it now would
add UI complexity without a clear latency win.

The product is single-user today. The only durable notion of “who to search for”
is `profiles.is_active = true`. Introducing a separate pinned daily-schedule
entity would be premature.

ADR-0002 still applies: workers must never auto-submit applications, and
document generation must remain human-triggered.

## Decision

1. **Move search/scoring onto BullMQ workers** backed by the existing Redis
   container. Discrete jobs:
   - `search-run` — Adzuna fetch, job upsert, embeddings, then fan-out
   - `score-match` — one profile+job Claude/semantic score + application row
2. **`POST /jobs/search` becomes fully async** — resolve/reuse the profile
   synchronously, enqueue `search-run`, return `202` with a run id. The UI
   polls run status (and/or refreshes the review queue) until completion.
3. **Daily cron** is a BullMQ repeatable job that enqueues `search-run` for the
   current active profile only. If none exists, it logs and no-ops. No pinned
   schedule table in this phase.
4. **Document generation stays synchronous** and human-triggered on the API.
   Revisit only if generation latency becomes a real problem.
5. **Worker process** lives as `services/api/src/worker.ts`, sharing existing
   lib modules — not a separate `services/worker` workspace yet.
6. **Progress is persisted** in a `search_runs` table so the UI and API can
   observe status without Redis introspection (Bull Board is Phase 4).

## Consequences

- Search no longer times out with the HTTP request; the UI must handle
  queued/running/completed/failed states.
- Retries and idempotency become first-class (stable BullMQ job ids + existing
  unique constraints on jobs/matches).
- Daily search depends on whoever last became the active profile via the UI.
- Generate CV/cover letter remains a blocking API call for now.
- A second long-running process (`pnpm worker`) is required locally alongside
  the API.
