# ADR-0004: Profile knowledge base for document generation

## Context

Generation (CV/cover letter) currently draws only on `profiles.resume_summary`,
a single freeform text field, plus the `skills`/`targetRoles`/`locations` arrays
that exist primarily to drive job matching. This gives Claude no real
structured facts to generate from, so it invents placeholder names, job
history, and education.

`profiles` is versioned deliberately (ADR-implicit in PROJECT_BRIEF section 5):
bumping `version` and inserting a new row keeps past match explanations
honest against the profile that produced them. Career data (work history,
education, certifications, achievements, contact info) has no relationship to
match explainability and should not be versioned the same way — editing a
past job's bullet points shouldn't fork search-preference history.

## Decision

1. Introduce new tables scoped to `user_id` directly, not `profile_id`, and
   not versioned: `personal_details` (1:1), `work_experience` (1:many,
   `bullets text[]` on the row), `education` (1:many), `certifications`
   (1:many), `achievements` (1:many), `skills` (1:many, freeform `category`
   column).
2. `profiles.skills` (flat array) is untouched and continues to drive
   matching/embeddings only. The new `skills` table is separate and feeds
   generation/display only — accepted duplication cost between the two.
3. Dates on `work_experience` and `education` are month/year granularity
   only (no day-level precision).
4. Generation prompts gain a serialization step that formats all of the
   above into structured context, replacing reliance on `resume_summary`
   as the primary source. `resume_summary` is repurposed as
   `personal_details.professional_summary` — a short pitch/framing input,
   not a fact source.
5. This work is tracked as Phase 7 in `docs/PROGRESS.md`, sequenced before
   Stripe payment gating (deploy timing still undecided, not blocking).

## Consequences

- New migration(s) required (next number after `0006_usage_quotas`).
- New CRUD API surface for six resources before any UI work is meaningful.
- Generation prompts get longer (more input tokens per call) — cost is
  bounded by existing quota system, not a new spend risk, but worth noting.
- Skill names can drift between `profiles.skills` (matching) and the new
  `skills` table (CV display) — accepted tradeoff, not a bug to "fix" later
  by merging them.
