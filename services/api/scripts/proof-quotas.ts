/**
 * Proof: trusted plan past trial limits; trial hits 2/day and 10-total with correct messages.
 *
 * pnpm --filter ./services/api exec tsx scripts/proof-quotas.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { db } from "../src/db/client";
import { usageCounters, userSettings } from "../src/db/schema";
import {
  consumeSearchQuota,
  ensureUserSettings,
  isQuotaExceededError,
  setUserPlan,
} from "../src/lib/quota";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const supabaseUrl = process.env.SUPABASE_URL?.trim()
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const password =
  process.env.PROOF_ISO_PASSWORD?.trim() || `QuotaProof${Date.now()}Aa1`;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase env vars required");
}

const stamp = Date.now();

async function createUser(label: string) {
  const email = `copilot.quota.${label}.${stamp}@example.com`;
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`${label} createUser: ${created.error?.message}`);
  }
  await ensureUserSettings(created.data.user.id);

  const anon = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) {
    throw new Error(`${label} login: ${login.error?.message}`);
  }
  return {
    email,
    userId: created.data.user.id,
    token: login.data.session.access_token,
  };
}

async function clearCounters(userId: string) {
  await db.delete(usageCounters).where(eq(usageCounters.userId, userId));
}

async function main() {
  console.log("=== create trusted + trial users ===");
  const trusted = await createUser("trusted");
  const trial = await createUser("trial");
  await setUserPlan(trusted.userId, "trusted");
  console.log("trusted:", trusted.userId, "plan=trusted");
  console.log("trial:", trial.userId, "plan=trial (default)");

  console.log("\n=== trusted: 3 search consumes (past trial daily 2) ===");
  for (let i = 1; i <= 3; i++) {
    await consumeSearchQuota(trusted.userId);
    console.log(`trusted consume #${i}: ok`);
  }

  console.log("\n=== HTTP: trusted POST /jobs/search (4th in day) ===");
  const trustedSearch = await fetch(`${apiUrl}/jobs/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trusted.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile: {
        skills: ["TypeScript"],
        targetRoles: ["Engineer"],
        locations: ["London"],
        remotePref: "any",
      },
    }),
  });
  const trustedSearchBody = await trustedSearch.text();
  console.log("status:", trustedSearch.status);
  console.log("body:", trustedSearchBody.slice(0, 300));

  console.log("\n=== trial: daily 2/day boundary ===");
  await clearCounters(trial.userId);
  await consumeSearchQuota(trial.userId);
  await consumeSearchQuota(trial.userId);
  console.log("trial consume #1 and #2: ok");
  let dailyMsg = "";
  try {
    await consumeSearchQuota(trial.userId);
    console.error("EXPECTED daily quota failure");
    process.exit(1);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }
    dailyMsg = error.payload.error;
    console.log("statusCode:", error.statusCode);
    console.log("payload:", JSON.stringify(error.payload));
  }

  console.log("\n=== HTTP: trial 3rd search same day → 429 ===");
  const trialDailyHttp = await fetch(`${apiUrl}/jobs/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trial.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile: {
        skills: ["TypeScript"],
        targetRoles: ["Engineer"],
        locations: ["London"],
        remotePref: "any",
      },
    }),
  });
  const trialDailyBody = await trialDailyHttp.text();
  console.log("status:", trialDailyHttp.status);
  console.log("body:", trialDailyBody);

  console.log("\n=== trial: 10-total boundary ===");
  await clearCounters(trial.userId);
  // Seed total at 9 with daily at 0 so one more succeeds, then total blocks
  const settings = (
    await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, trial.userId))
      .limit(1)
  )[0];
  const trialStart = new Date(
    Date.UTC(
      settings.trialStartedAt.getUTCFullYear(),
      settings.trialStartedAt.getUTCMonth(),
      settings.trialStartedAt.getUTCDate(),
    ),
  );
  await db.insert(usageCounters).values({
    userId: trial.userId,
    metric: "search_trial_total",
    periodStart: trialStart,
    count: 9,
  });
  await consumeSearchQuota(trial.userId);
  console.log("trial consume at total 9→10: ok");
  let totalMsg = "";
  try {
    await consumeSearchQuota(trial.userId);
    console.error("EXPECTED total quota failure");
    process.exit(1);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }
    totalMsg = error.payload.error;
    console.log("statusCode:", error.statusCode);
    console.log("payload:", JSON.stringify(error.payload));
  }

  console.log("\n=== HTTP: trial at total 10 → 429 ===");
  // daily may also be at 1 from the 9→10 consume; clear daily only
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  await db
    .delete(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, trial.userId),
        eq(usageCounters.metric, "search_daily"),
        eq(usageCounters.periodStart, todayUtc),
      ),
    );
  const trialTotalHttp = await fetch(`${apiUrl}/jobs/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trial.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile: {
        skills: ["TypeScript"],
        targetRoles: ["Engineer"],
        locations: ["London"],
        remotePref: "any",
      },
    }),
  });
  const trialTotalBody = await trialTotalHttp.text();
  console.log("status:", trialTotalHttp.status);
  console.log("body:", trialTotalBody);

  const ok =
    trustedSearch.status === 202 &&
    dailyMsg.includes("Daily search limit reached (2/day)") &&
    trialDailyHttp.status === 429 &&
    trialDailyBody.includes("Daily search limit reached (2/day)") &&
    totalMsg.includes("Trial search limit reached (10 total)") &&
    trialTotalHttp.status === 429 &&
    trialTotalBody.includes("Trial search limit reached (10 total)");

  if (!ok) {
    console.error("\nPROOF FAILED");
    process.exit(1);
  }
  console.log(
    "\nPROOF OK: trusted past trial daily; trial 2/day + 10-total return correct 429 messages",
  );
}

void main();
