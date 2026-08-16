import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { trustedInvites, userSettings } from "../db/schema";
import { getSupabaseAdmin } from "./auth";
import { ensureUserSettings, setUserPlan } from "./quota";

/**
 * ADR-0006: trusted-plan invites, admin-issued. Plain functions (not route
 * handlers), same shape as profile-knowledge.ts/quota.ts - routes/admin.ts
 * and routes/invites.ts are thin Fastify wrappers around these.
 */

export const INVITE_EXPIRY_DAYS = 7;

export type TrustedInviteRow = typeof trustedInvites.$inferSelect;

export type InviteStatus = "valid" | "expired" | "accepted" | "revoked" | "not_found";

/**
 * Thrown by createTrustedInvite when the target email already belongs to a
 * Pro-plan account. Hard structural rule (ADR-0006): this mechanism can
 * never write to an already-Pro user - refused cleanly here, and again in
 * acceptInvite for the case where the invite predates a Free/Trusted ->
 * Pro upgrade (see acceptInvite's comment).
 */
export class AlreadyProError extends Error {
  constructor(email: string) {
    super(
      `This account (${email}) is already on the Pro plan - trusted invites cannot be sent to Pro accounts.`,
    );
    this.name = "AlreadyProError";
  }
}

export function isAlreadyProError(error: unknown): error is AlreadyProError {
  return error instanceof AlreadyProError;
}

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Resolves an email to an existing Supabase Auth user id, or null if no
 * account exists yet for that email. The Supabase admin API has no direct
 * email filter (confirmed against the installed @supabase/supabase-js
 * types - listUsers only takes page/perPage), so this loops pages and
 * matches client-side. Current real usage is ~8 accounts - resolves on
 * page 1 in practice; loops defensively so it doesn't silently break if
 * the user base grows past one page.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list Supabase users: ${error.message}`);
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) {
      return match.id;
    }
    if (data.users.length < perPage) {
      return null;
    }
    page += 1;
  }
}

/**
 * Creates a trusted invite. Hard rule enforcement point #1: refuses (throws
 * AlreadyProError, not a silent no-op) if the email already belongs to an
 * existing Pro-plan account. Deliberately does NOT use ensureUserSettings
 * for this check - that function has an insert side effect (creates a row
 * defaulting to plan "free" if missing), which would be wrong here: a plain
 * read-only SELECT is all this check needs, and an email with no matching
 * user_settings row simply isn't Pro (nothing to block).
 */
export async function createTrustedInvite(
  email: string,
  createdBy: string,
): Promise<TrustedInviteRow> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUserId = await findUserIdByEmail(normalizedEmail);
  if (existingUserId) {
    const [settings] = await db
      .select({ plan: userSettings.plan })
      .from(userSettings)
      .where(eq(userSettings.userId, existingUserId))
      .limit(1);
    if (settings?.plan === "pro") {
      throw new AlreadyProError(normalizedEmail);
    }
  }

  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const [row] = await db
    .insert(trustedInvites)
    .values({ email: normalizedEmail, token, createdBy, expiresAt })
    .returning();
  if (!row) {
    throw new Error("Failed to create invite");
  }
  return row;
}

export async function getInviteByToken(token: string): Promise<TrustedInviteRow | null> {
  const [row] = await db
    .select()
    .from(trustedInvites)
    .where(eq(trustedInvites.token, token))
    .limit(1);
  return row ?? null;
}

export function computeInviteStatus(invite: TrustedInviteRow | null): InviteStatus {
  if (!invite) {
    return "not_found";
  }
  if (invite.revokedAt) {
    return "revoked";
  }
  if (invite.acceptedAt) {
    return "accepted";
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return "expired";
  }
  return "valid";
}

export type AcceptInviteResult =
  | { ok: true; plan: "trusted" }
  | {
      ok: false;
      reason: "not_found" | "revoked" | "expired" | "accepted" | "email_mismatch" | "already_pro";
      message: string;
    };

/**
 * Accepts an invite for the currently-authenticated userId/userEmail (the
 * caller, e.g. routes/invites.ts, gets these from the verified JWT - no
 * Supabase admin API call needed on this path at all).
 *
 * Hard rule enforcement point #2 (the accept-time addition beyond the
 * original spec): even though createTrustedInvite already refuses to issue
 * an invite to an already-Pro account, a user could still be Free/Trusted
 * when invited and upgrade to Pro before clicking the link. Without this
 * check, accepting would downgrade a paying Pro account to Trusted. Checked
 * AFTER the email-match check (so a wrong-account click gets the right
 * error) but BEFORE setUserPlan/marking accepted (so a real block never
 * partially applies).
 */
export async function acceptInvite(
  token: string,
  userId: string,
  userEmail: string | undefined,
): Promise<AcceptInviteResult> {
  const invite = await getInviteByToken(token);
  const status = computeInviteStatus(invite);

  if (!invite || status === "not_found") {
    return { ok: false, reason: "not_found", message: "This invite link isn't valid." };
  }
  if (status === "revoked") {
    return { ok: false, reason: "revoked", message: "This invite has been revoked." };
  }
  if (status === "expired") {
    return {
      ok: false,
      reason: "expired",
      message: "This invite has expired - ask an admin to send a new one.",
    };
  }
  if (status === "accepted") {
    return { ok: false, reason: "accepted", message: "This invite has already been used." };
  }

  const normalizedInviteEmail = invite.email.trim().toLowerCase();
  const normalizedUserEmail = (userEmail ?? "").trim().toLowerCase();
  if (!normalizedUserEmail || normalizedUserEmail !== normalizedInviteEmail) {
    return {
      ok: false,
      reason: "email_mismatch",
      message: `This invite was sent to ${invite.email}, but you're signed in as ${
        userEmail ?? "a different account"
      }. Log in as ${invite.email} to accept it.`,
    };
  }

  const settings = await ensureUserSettings(userId);
  if (settings.plan === "pro") {
    return {
      ok: false,
      reason: "already_pro",
      message: "Your account is already on the Pro plan - no change needed.",
    };
  }

  await setUserPlan(userId, "trusted");
  await db
    .update(trustedInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(trustedInvites.id, invite.id));

  return { ok: true, plan: "trusted" };
}

export async function listInvites(): Promise<TrustedInviteRow[]> {
  return db.select().from(trustedInvites).orderBy(desc(trustedInvites.createdAt));
}

/**
 * Revokes a pending (not yet accepted, not already revoked) invite. Returns
 * null (not an error) if the invite doesn't exist or isn't revocable
 * anymore - the route layer turns that into a 404, distinguishing "nothing
 * to revoke" from a real failure.
 */
export async function revokeInvite(id: string): Promise<TrustedInviteRow | null> {
  const [row] = await db
    .update(trustedInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(trustedInvites.id, id),
        isNull(trustedInvites.acceptedAt),
        isNull(trustedInvites.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}
