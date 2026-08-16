# ADR-0006: Admin access and trusted-plan invites

## Context

There was no way to inspect real users' plans/usage or to grant the Trusted
plan without directly editing the database or running `set-user-plan.ts`
blind (no visibility into whether the target account was already Pro).
Local Postgres also has no way to display a user's email - it stores only
`user_id`, no FK to Supabase's `auth.users` (same convention as every other
`user_id`-scoped table in this schema) - so any admin-facing user list needs
a way to resolve emails from Supabase itself.

## Decision

1. **New `user_settings.is_admin boolean`** column, default `false`. Only
   ever settable via `scripts/set-admin.ts` (same one-off-script pattern as
   `set-user-plan.ts`) - never through any route or UI.
2. **`requireAdmin`** (`lib/auth.ts`): a per-route Fastify `onRequest` hook
   (not global), applied via the route option `{ onRequest: requireAdmin }`
   to every `/admin/*` route except `GET /admin/me`. Runs after the global
   `requireSupabaseAuth` hook has set `request.user`, so it only needs to
   look up `user_settings.is_admin` for that id.
3. **Emails resolved via the Supabase Admin API** (`supabase.auth.admin.
   listUsers`/`getUserById`), using the already-existing `SUPABASE_SERVICE_
   ROLE_KEY` and the already-existing `getSupabaseAdmin()` client
   (previously used only for JWT verification in `requireSupabaseAuth`).
   **No new credential, no new env var** - but a real expansion of what our
   code does with an already-maximally-privileged key: previously it only
   verified tokens, now it also reads the full Auth user directory. The
   key's own power is unchanged (`service_role` has always had full Auth
   admin access); what changes is the surface of our own code that
   exercises it, and therefore the blast radius of a bug in the new admin
   routes. `listUsers` has no email-filter parameter (confirmed against the
   installed `@supabase/supabase-js` types) - resolving a specific email
   loops pages and matches client-side; at current scale (~8 real users)
   this resolves on page 1.
4. **New `trusted_invites` table** (`id`, `email`, `token` unique, `created_
   by`, `created_at`, `expires_at`, `accepted_at`, `revoked_at` - no FK on
   `created_by`, same no-cross-DB-FK convention as everywhere else).
   7-day expiry, fixed, not admin-configurable.
5. **Hard structural rule, enforced at two separate points, not one:**
   this mechanism can never write `plan: "trusted"` over an existing `plan:
   "pro"`.
   - At invite **creation** (`createTrustedInvite`): refuses with a thrown
     `AlreadyProError` (surfaced as a clean 400, not a silent no-op) if the
     target email already belongs to an existing Pro account.
   - At invite **acceptance** (`acceptInvite`), independently: even though
     creation already blocks Pro targets, an account could still be
     Free/Trusted when invited and upgrade to Pro before clicking the link.
     Accepting in that case must not downgrade a paying account to
     Trusted - so `acceptInvite` re-checks the current plan immediately
     before writing, after the email-match check but before `setUserPlan`,
     and refuses cleanly (leaving the invite un-accepted, not silently
     marked used) if the account is now Pro.
6. **Accept flow is split into a read-only `GET /invites/:token` and a
   mutating `POST /invites/:token/accept`**, deliberately never combined.
   A GET that auto-accepted would let email link-scanners/prefetchers burn
   the invite before the real recipient ever opens it.
7. **Revoke included in v1**: `revoked_at` on the table, `POST /admin/
   invites/:id/revoke`, checked in both the status computation and the
   accept flow. Small enough addition over the base design that leaving it
   out would be a needless gap.
8. **Frontend**: `/admin` page and a nav link in `TopBar`, both gated by a
   client-side `GET /admin/me` check - convenience only. The real
   enforcement is `requireAdmin` on every data-returning route; a non-admin
   who bypasses the frontend gate gets a 403 from each one.

## Consequences

- A known, minor UX gap, not fixed here: if a not-yet-logged-in person
  clicks an invite link, `middleware.ts` redirects to `/login` (clearing
  the destination), and the existing login page has no `returnTo`
  mechanism (hardcoded `router.replace("/dashboard")` on success) - so they
  land on the dashboard, not back on the invite. The invite itself is
  unaffected (still valid, not consumed) - they just need to click the
  original link a second time after logging in. Fixing this would mean
  adding a generic redirect-preservation mechanism to shared login/
  middleware code, which is a broader change than this feature's scope;
  flagged for a future pass rather than bundled in here.
- `GET /admin/users` calls `listUsers` plus one `getQuotaSummary` per user
  on every request - fine at current scale (~8 users), would need caching
  or a bulk quota-read path if the user base grows substantially.
- Admin status is not embedded in the Supabase JWT (no custom claims/access
  token hooks in use) - every admin check is a real DB read, not a token
  decode. Simpler, consistent with how `requireSupabaseAuth` already works
  end-to-end, but means `requireAdmin` costs one extra query per admin
  request.
