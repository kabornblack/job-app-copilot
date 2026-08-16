import { apiFetch } from "./api";
import { extractErrorMessage } from "./error-message";

/**
 * Typed client for the ADR-0006 admin API (services/api/src/routes/admin.ts
 * and routes/invites.ts). Field names/shapes mirror those route files by
 * hand, same as profile-knowledge-api.ts - no shared types package in this
 * monorepo.
 */

async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(extractErrorMessage(rawBody, fallback));
  }
  return response.json() as Promise<T>;
}

export type QuotaSummaryEntry = {
  metric: string;
  used: number;
  limit: number;
  resetsAt: string | null;
};

export type QuotaSummary = {
  plan: "free" | "pro" | "trusted" | "payg";
  search: QuotaSummaryEntry;
  cvGen: QuotaSummaryEntry;
  coverLetterGen: QuotaSummaryEntry;
  scoreCalls: QuotaSummaryEntry;
};

export type AdminUserOverview = {
  userId: string;
  email: string | null;
  quota: QuotaSummary;
};

export type TrustedInvite = {
  id: string;
  email: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export async function getAdminStatus(): Promise<{ isAdmin: boolean }> {
  const response = await apiFetch("/admin/me");
  return parseOrThrow(response, "Failed to check admin status");
}

export async function listAdminUsers(): Promise<AdminUserOverview[]> {
  const response = await apiFetch("/admin/users");
  const data = await parseOrThrow<{ items: AdminUserOverview[] }>(
    response,
    "Failed to load users",
  );
  return data.items;
}

export async function listAdminInvites(): Promise<TrustedInvite[]> {
  const response = await apiFetch("/admin/invites");
  const data = await parseOrThrow<{ items: TrustedInvite[] }>(
    response,
    "Failed to load invites",
  );
  return data.items;
}

export async function createInvite(email: string): Promise<TrustedInvite> {
  const response = await apiFetch("/admin/invites", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return parseOrThrow(response, "Failed to create invite");
}

export async function revokeInvite(id: string): Promise<TrustedInvite> {
  const response = await apiFetch(`/admin/invites/${id}/revoke`, {
    method: "POST",
  });
  return parseOrThrow(response, "Failed to revoke invite");
}

// ---------------------------------------------------------------------------
// Accept-invite flow (any authenticated user, not admin-only)
// ---------------------------------------------------------------------------

export type InviteStatusResponse = {
  status: "valid" | "expired" | "accepted" | "revoked" | "not_found";
  email: string | null;
  expiresAt: string | null;
};

export type AcceptInviteResponse =
  | { ok: true; plan: "trusted" }
  | {
      ok: false;
      reason: string;
      message: string;
    };

export async function getInviteStatus(token: string): Promise<InviteStatusResponse> {
  const response = await apiFetch(`/invites/${token}`);
  return parseOrThrow(response, "Failed to load invite");
}

/** Deliberately does NOT throw on a well-formed refusal (expired/accepted/
 * email-mismatch/already-pro) - those are valid, expected outcomes the
 * caller renders directly, not error states. Only throws on a genuine
 * transport/parse failure. */
export async function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  const response = await apiFetch(`/invites/${token}/accept`, { method: "POST" });
  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody) as AcceptInviteResponse;
  } catch {
    throw new Error(extractErrorMessage(rawBody, "Failed to accept invite"));
  }
}
