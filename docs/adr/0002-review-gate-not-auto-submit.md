# ADR-0002: Review gate and no automatic submission

## Context

The product requirement is explicit: the system must never submit applications automatically. Every generated CV and cover letter must be reviewed by a human before any action is taken. This rule is central to the product's trust model and should be preserved in both the UX and the architecture.

## Decision

We will implement a review-gated workflow in which generated documents enter a review queue and remain pending until an explicit human approval. The system will not introduce any automated submission path, even if later phases add stronger automation around job matching or document generation.

## Consequences

- The product remains aligned with the stated safety and trust principle.
- The implementation must preserve a clear review step before any external action.
- Later automation work must be designed around this gate rather than bypassing it.
