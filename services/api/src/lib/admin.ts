import { db } from "../db/client";
import { userSettings } from "../db/schema";
import { getSupabaseAdmin } from "./auth";
import { getQuotaSummary, type QuotaSummary } from "./quota";

/**
 * ADR-0006: admin user-list overview. Plain function (not a route handler),
 * same shape as the rest of lib/*.ts - routes/admin.ts is a thin Fastify
 * wrapper. Resolves emails via the Supabase admin API (paginated, same
 * approach as lib/invites.ts's findUserIdByEmail) since local Postgres has
 * no FK to auth.users and never stores email.
 */

export type AdminUserOverview = {
  userId: string;
  email: string | null;
  quota: QuotaSummary;
};

async function listAllSupabaseEmails(): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const emailByUserId = new Map<string, string>();
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list Supabase users: ${error.message}`);
    }
    for (const user of data.users) {
      if (user.email) {
        emailByUserId.set(user.id, user.email);
      }
    }
    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }
  return emailByUserId;
}

export async function listUsersForAdmin(): Promise<AdminUserOverview[]> {
  const [rows, emailByUserId] = await Promise.all([
    db.select({ userId: userSettings.userId }).from(userSettings),
    listAllSupabaseEmails(),
  ]);

  return Promise.all(
    rows.map(async (row) => ({
      userId: row.userId,
      email: emailByUserId.get(row.userId) ?? null,
      quota: await getQuotaSummary(row.userId),
    })),
  );
}
