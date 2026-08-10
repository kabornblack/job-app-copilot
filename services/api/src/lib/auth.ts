import { createClient, type User } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";

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

function getSupabaseAdmin() {
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
