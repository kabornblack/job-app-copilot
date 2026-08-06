# ADR-0001: Overall architecture

## Context

The project needs a full-stack system that can ingest jobs, evaluate them against a user profile, generate reviewable documents, and track application status over time. The implementation must be split across a web frontend, an API layer, a database, background processing, and supporting infrastructure while remaining straightforward for an early-stage portfolio project.

## Decision

We will use a monorepo with a Next.js frontend and a Fastify API as separate workspaces, backed by PostgreSQL with pgvector, Redis for queueing, and Docker Compose for local development. The API will own orchestration and persistence, while the frontend will focus on the dashboard and review workflow. Background workers and scheduled jobs will be introduced later in the roadmap, but the architecture will be prepared for them from the start.

## Consequences

- The repository remains simple to run locally with a single Docker Compose environment.
- The frontend and API can evolve independently while sharing a common TypeScript toolchain.
- The initial scaffold is intentionally minimal and will need further implementation in later phases.
