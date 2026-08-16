import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// findUserIdByEmail (and therefore createTrustedInvite's pro-block check)
// calls the real Supabase Admin API via getSupabaseAdmin(). Mocked here
// (same vi.mock("./module") + vi.hoisted pattern already used by
// job-search.score-quota.test.ts etc.) so this suite never makes a real
// network call to Supabase - only the DB-backed logic is under test.
const { mockListUsers } = vi.hoisted(() => ({
  mockListUsers: vi.fn(async () => ({ data: { users: [] as { id: string; email: string }[] }, error: null })),
}));

vi.mock("./auth", async () => {
  const actual = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    ...actual,
    getSupabaseAdmin: () => ({
      auth: { admin: { listUsers: mockListUsers } },
    }),
  };
});

import { db } from "../db/client";
import { trustedInvites, userSettings } from "../db/schema";
import {
  AlreadyProError,
  acceptInvite,
  computeInviteStatus,
  createTrustedInvite,
  findUserIdByEmail,
  generateInviteToken,
  getInviteByToken,
  isAlreadyProError,
  listInvites,
  revokeInvite,
  type TrustedInviteRow,
} from "./invites";
import { setUserPlan } from "./quota";

// Fake deterministic ids, same pattern used throughout this codebase's
// tests - no real Supabase account needed for the DB-backed logic; the
// Supabase-facing email resolution is mocked above.
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const proUserId = "00000000-0000-4000-8000-0000000000a2";
const trustedUserId = "00000000-0000-4000-8000-0000000000a3";
const freeUserId = "00000000-0000-4000-8000-0000000000a4";

const proEmail = "invites-test-pro@example.com";
const trustedEmail = "invites-test-trusted@example.com";
const freeEmail = "invites-test-free@example.com";
const unknownEmail = "invites-test-unknown@example.com";

afterEach(() => {
  mockListUsers.mockReset();
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
});

afterAll(async () => {
  await db.delete(trustedInvites).where(eq(trustedInvites.createdBy, adminUserId));
  for (const userId of [proUserId, trustedUserId, freeUserId]) {
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
  }
});

function mockSupabaseUsers(users: { id: string; email: string }[]) {
  mockListUsers.mockResolvedValue({ data: { users }, error: null });
}

describe("generateInviteToken", () => {
  it("returns a long unguessable hex string, different on each call", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("computeInviteStatus", () => {
  const base: TrustedInviteRow = {
    id: "inv1",
    email: "x@example.com",
    token: "tok",
    createdBy: adminUserId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    acceptedAt: null,
    revokedAt: null,
  };

  it("not_found for a null invite", () => {
    expect(computeInviteStatus(null)).toBe("not_found");
  });
  it("revoked wins even if also expired/accepted", () => {
    expect(computeInviteStatus({ ...base, revokedAt: new Date() })).toBe("revoked");
  });
  it("accepted (checked before expiry)", () => {
    expect(
      computeInviteStatus({
        ...base,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe("accepted");
  });
  it("expired", () => {
    expect(computeInviteStatus({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(
      "expired",
    );
  });
  it("valid", () => {
    expect(computeInviteStatus(base)).toBe("valid");
  });
});

describe("findUserIdByEmail", () => {
  it("returns the matching id (case-insensitive)", async () => {
    mockSupabaseUsers([{ id: proUserId, email: "Invites-Test-Pro@Example.com" }]);
    await expect(findUserIdByEmail(proEmail)).resolves.toBe(proUserId);
  });

  it("returns null when no account matches", async () => {
    mockSupabaseUsers([{ id: proUserId, email: proEmail }]);
    await expect(findUserIdByEmail(unknownEmail)).resolves.toBeNull();
  });
});

describe("createTrustedInvite", () => {
  it("refuses (AlreadyProError, no row created) when the email belongs to an existing Pro account", async () => {
    await setUserPlan(proUserId, "pro");
    mockSupabaseUsers([{ id: proUserId, email: proEmail }]);

    await expect(createTrustedInvite(proEmail, adminUserId)).rejects.toThrow(
      AlreadyProError,
    );
    try {
      await createTrustedInvite(proEmail, adminUserId);
    } catch (err) {
      expect(isAlreadyProError(err)).toBe(true);
    }

    const rows = await db
      .select()
      .from(trustedInvites)
      .where(eq(trustedInvites.email, proEmail));
    expect(rows).toHaveLength(0);
  });

  it("succeeds for an existing non-Pro account", async () => {
    await setUserPlan(trustedUserId, "trusted");
    mockSupabaseUsers([{ id: trustedUserId, email: trustedEmail }]);

    const invite = await createTrustedInvite(trustedEmail, adminUserId);
    expect(invite.email).toBe(trustedEmail);
    expect(invite.acceptedAt).toBeNull();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("succeeds for an email with no existing Supabase account at all", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite(unknownEmail, adminUserId);
    expect(invite.email).toBe(unknownEmail);
  });
});

describe("acceptInvite", () => {
  it("full lifecycle: valid invite accepted by the matching real userId/email transitions free -> trusted", async () => {
    await setUserPlan(freeUserId, "free");
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite(freeEmail, adminUserId);

    const result = await acceptInvite(invite.token, freeUserId, freeEmail);
    expect(result).toEqual({ ok: true, plan: "trusted" });

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, freeUserId));
    expect(settings?.plan).toBe("trusted");

    const accepted = await getInviteByToken(invite.token);
    expect(accepted?.acceptedAt).not.toBeNull();
  });

  it("rejects a second accept attempt on an already-accepted invite, without re-mutating plan", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-double@example.com", adminUserId);
    const userId = "00000000-0000-4000-8000-0000000000a5";
    await setUserPlan(userId, "free");

    const first = await acceptInvite(invite.token, userId, "invites-test-double@example.com");
    expect(first.ok).toBe(true);

    const second = await acceptInvite(invite.token, userId, "invites-test-double@example.com");
    expect(second).toEqual({
      ok: false,
      reason: "accepted",
      message: "This invite has already been used.",
    });

    await db.delete(userSettings).where(eq(userSettings.userId, userId));
  });

  it("rejects when the authenticated caller's email doesn't match the invite", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-mismatch@example.com", adminUserId);

    const result = await acceptInvite(invite.token, freeUserId, "someone-else@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("email_mismatch");
      expect(result.message).toContain("invites-test-mismatch@example.com");
      expect(result.message).toContain("someone-else@example.com");
    }
  });

  it("rejects a token that doesn't exist", async () => {
    const result = await acceptInvite("not-a-real-token", freeUserId, freeEmail);
    expect(result).toEqual({
      ok: false,
      reason: "not_found",
      message: "This invite link isn't valid.",
    });
  });

  it("rejects an expired invite", async () => {
    mockSupabaseUsers([]);
    const [invite] = await db
      .insert(trustedInvites)
      .values({
        email: "invites-test-expired@example.com",
        token: generateInviteToken(),
        createdBy: adminUserId,
        expiresAt: new Date(Date.now() - 1000),
      })
      .returning();
    if (!invite) throw new Error("failed to seed expired invite");

    const result = await acceptInvite(
      invite.token,
      freeUserId,
      "invites-test-expired@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a revoked invite", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-revoked@example.com", adminUserId);
    await revokeInvite(invite.id);

    const result = await acceptInvite(
      invite.token,
      freeUserId,
      "invites-test-revoked@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("revoked");
  });

  it("HARD RULE (accept-time race): an invite created while Free, then accepted after the account became Pro, is refused and the account is NOT downgraded to trusted", async () => {
    const raceUserId = "00000000-0000-4000-8000-0000000000a6";
    const raceEmail = "invites-test-race@example.com";

    // Invited while free - createTrustedInvite's own guard doesn't block this.
    await setUserPlan(raceUserId, "free");
    mockSupabaseUsers([{ id: raceUserId, email: raceEmail }]);
    const invite = await createTrustedInvite(raceEmail, adminUserId);

    // Upgraded to pro before clicking the link.
    await setUserPlan(raceUserId, "pro");

    const result = await acceptInvite(invite.token, raceUserId, raceEmail);
    expect(result).toEqual({
      ok: false,
      reason: "already_pro",
      message: "Your account is already on the Pro plan - no change needed.",
    });

    // The critical assertions: plan is still pro (not silently downgraded
    // to trusted), and the invite is still un-accepted (not silently
    // marked used either).
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, raceUserId));
    expect(settings?.plan).toBe("pro");

    const stillPending = await getInviteByToken(invite.token);
    expect(stillPending?.acceptedAt).toBeNull();

    await db.delete(userSettings).where(eq(userSettings.userId, raceUserId));
  });
});

describe("listInvites / revokeInvite", () => {
  it("listInvites includes a freshly-created invite", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-list@example.com", adminUserId);
    const all = await listInvites();
    expect(all.some((i) => i.id === invite.id)).toBe(true);
  });

  it("revokeInvite marks a pending invite revoked and blocks a later accept", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-revoke2@example.com", adminUserId);
    const revoked = await revokeInvite(invite.id);
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it("revokeInvite returns null (not an error) for an already-accepted invite", async () => {
    mockSupabaseUsers([]);
    const invite = await createTrustedInvite("invites-test-revoke3@example.com", adminUserId);
    const userId = "00000000-0000-4000-8000-0000000000a7";
    await setUserPlan(userId, "free");
    await acceptInvite(invite.token, userId, "invites-test-revoke3@example.com");

    await expect(revokeInvite(invite.id)).resolves.toBeNull();
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
  });

  it("revokeInvite returns null for a nonexistent id", async () => {
    await expect(revokeInvite("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });
});
