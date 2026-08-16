import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import { userSettings } from "../db/schema";
import { ensureUserSettings } from "./quota";
import { isUserAdmin, requireAdmin, setUserAdmin } from "./auth";

// Fake deterministic user ids, same pattern used throughout this codebase's
// tests - no real Supabase account needed, auth.ts's DB-backed admin logic
// is tested independently of JWT verification. This codebase has no
// Fastify-hook test harness (requireSupabaseAuth itself has no test file
// either), so requireAdmin is exercised here with minimal fake
// request/reply objects rather than a real server.
const adminUserId = "00000000-0000-4000-8000-0000000000b1";
const nonAdminUserId = "00000000-0000-4000-8000-0000000000b2";

afterAll(async () => {
  for (const userId of [adminUserId, nonAdminUserId]) {
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
  }
});

describe("isUserAdmin / setUserAdmin", () => {
  it("defaults to false for a user with no override", async () => {
    await ensureUserSettings(nonAdminUserId);
    await expect(isUserAdmin(nonAdminUserId)).resolves.toBe(false);
  });

  it("returns false for a userId with no user_settings row at all", async () => {
    await expect(isUserAdmin("00000000-0000-4000-8000-0000000000b9")).resolves.toBe(
      false,
    );
  });

  it("setUserAdmin(true) then isUserAdmin reflects it, and setUserAdmin(false) reverts it", async () => {
    await ensureUserSettings(adminUserId);
    await expect(isUserAdmin(adminUserId)).resolves.toBe(false);

    await setUserAdmin(adminUserId, true);
    await expect(isUserAdmin(adminUserId)).resolves.toBe(true);

    await setUserAdmin(adminUserId, false);
    await expect(isUserAdmin(adminUserId)).resolves.toBe(false);
  });
});

describe("requireAdmin", () => {
  function fakeReply() {
    const calls: { status?: number; body?: unknown } = {};
    return {
      sent: false,
      status(code: number) {
        calls.status = code;
        return this;
      },
      async send(body: unknown) {
        calls.body = body;
        return this;
      },
      calls,
    };
  }

  it("401s when request.user is missing (auth hook never ran / no token)", async () => {
    const reply = fakeReply();
    // @ts-expect-error - minimal fake request, only .user is read
    await requireAdmin({ user: undefined }, reply);
    expect(reply.calls.status).toBe(401);
  });

  it("403s for an authenticated non-admin user", async () => {
    await ensureUserSettings(nonAdminUserId);
    const reply = fakeReply();
    // @ts-expect-error - minimal fake request, only .user is read
    await requireAdmin({ user: { id: nonAdminUserId } }, reply);
    expect(reply.calls.status).toBe(403);
  });

  it("does not send any reply for an authenticated admin user (falls through to the route)", async () => {
    await ensureUserSettings(adminUserId);
    await setUserAdmin(adminUserId, true);
    const reply = fakeReply();
    // @ts-expect-error - minimal fake request, only .user is read
    await requireAdmin({ user: { id: adminUserId } }, reply);
    expect(reply.calls.status).toBeUndefined();
    await setUserAdmin(adminUserId, false);
  });
});
