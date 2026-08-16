import { createClient, type User } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { userSettings } from "../db/schema";

export type AuthUser = {
  id: string;
  email: string | undefined;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function isPublicRoute(url: string, method: string): boolean {
  if (method === "OPTIONS") {
    return true;
  }
  const path = url.split("?")[0] ?? url;
  if (path === "/health") {
    return true;
  }
  if (path === "/auth/signup" && method === "POST") {
    return true;
  }
  if (path.startsWith("/admin/queues")) {
    return true;
  }
  if (path === "/debug/sentry-test") {
    return true;
  }
  return false;
}

/** Project root only — strip accidental /rest/v1 suffixes from dashboard copy-paste. */
export function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

/** Exported for lib/invites.ts (resolving invited emails to Supabase user
 * ids via auth.admin.listUsers) - same service-role client used for JWT
 * verification below, no new credential. See ADR-0006. */
export function getSupabaseAdmin() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth",
    );
  }
  const url = normalizeSupabaseUrl(rawUrl);
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Anon client for signup — respects project Confirm-email settings. */
export function getSupabaseAnon() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for signup");
  }
  const url = normalizeSupabaseUrl(rawUrl);
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
  };
}

/**
 * Global Fastify onRequest gate: verify Bearer Supabase JWT on protected routes.
 * Attaches request.user; does not change route handler logic.
 */
export async function requireSupabaseAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (reply.sent) {
    return;
  }
  if (isPublicRoute(request.url, request.method)) {
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      await reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    request.user = toAuthUser(data.user);
  } catch (error) {
    request.log.error({ err: error }, "auth verification failed");
    await reply.status(401).send({ error: "Unauthorized" });
  }
}

/**
 * ADR-0006: plain, directly-testable lookup - kept separate from the
 * requireAdmin hook below so the actual admin check has real Postgres test
 * coverage without needing a Fastify request/reply harness (this codebase
 * has none; requireSupabaseAuth itself has no test file either).
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isAdmin: userSettings.isAdmin })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.isAdmin ?? false;
}

/**
 * Only ever called from scripts/set-admin.ts (same one-off-script pattern
 * as quota.ts's setUserPlan / scripts/set-user-plan.ts) - never through any
 * route or UI. Assumes the row already exists (ensureUserSettings has
 * always run by the time a real account is worth promoting to admin);
 * callers needing that guarantee should call ensureUserSettings first.
 */
export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
  await db
    .update(userSettings)
    .set({ isAdmin, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}

/**
 * Per-route onRequest hook (not global) for the /admin/* routes that list
 * users or manage invites - registered as route option
 * { onRequest: requireAdmin }, running after the global requireSupabaseAuth
 * hook has already set request.user. GET /admin/me deliberately does NOT
 * use this hook - it's how a non-admin finds out they're not one.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (reply.sent) {
    return;
  }
  const userId = request.user?.id;
  if (!userId) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const admin = await isUserAdmin(userId);
  if (!admin) {
    await reply.status(403).send({ error: "Admin access required" });
  }
}
