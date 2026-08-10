/**
 * Two-user isolation proof:
 * - A and B each see only their review-queue rows
 * - B gets 404 on A's applicationId (status PATCH)
 *
 * Requires PROOF_ISO_PASSWORD in the environment (throwaway local accounts).
 * pnpm --filter ./services/api exec tsx scripts/proof-user-isolation.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { db } from "../src/db/client";
import {
  applications,
  jobs,
  matches,
  profiles,
} from "../src/db/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const supabaseUrl = process.env.SUPABASE_URL?.trim()
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const password = process.env.PROOF_ISO_PASSWORD?.trim();

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase env vars required");
}
if (!password) {
  throw new Error("PROOF_ISO_PASSWORD required (local throwaway auth password)");
}

const stamp = Date.now();

async function createConfirmedUser(label: string) {
  const email = `copilot.iso.${label}.${stamp}@gmail.com`;
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password: password!,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`${label} createUser: ${created.error?.message}`);
  }

  const anon = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await anon.auth.signInWithPassword({
    email,
    password: password!,
  });
  if (login.error || !login.data.session?.access_token) {
    throw new Error(`${label} login: ${login.error?.message}`);
  }

  return {
    label,
    email,
    userId: created.data.user.id,
    token: login.data.session.access_token,
  };
}

async function seedOwnedApplication(options: {
  userId: string;
  title: string;
  externalId: string;
}) {
  const embedding = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 0.2 : 0));
  const [profile] = await db
    .insert(profiles)
    .values({
      userId: options.userId,
      version: 1,
      skills: ["TypeScript"],
      targetRoles: ["Engineer"],
      locations: ["London"],
      remotePref: "any",
      isActive: true,
      resumeSummary: `Isolation seed ${options.externalId}`,
    })
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      source: "isolation-test",
      externalId: options.externalId,
      fingerprint: `fp-${options.externalId}`,
      title: options.title,
      company: `${options.title} Co`,
      location: "London",
      url: `https://example.test/${options.externalId}`,
      embedding,
    })
    .returning();

  const [match] = await db
    .insert(matches)
    .values({
      userId: options.userId,
      jobId: job.id,
      profileId: profile.id,
      score: "77.0",
      explanation: `Owned by ${options.userId}`,
      modelVersion: "isolation-proof-v1",
    })
    .returning();

  const [application] = await db
    .insert(applications)
    .values({
      userId: options.userId,
      jobId: job.id,
      matchId: match.id,
      status: "found",
    })
    .returning();

  return { profile, job, match, application };
}

async function main() {
  console.log("=== create users A and B ===");
  const userA = await createConfirmedUser("a");
  const userB = await createConfirmedUser("b");
  console.log("A:", { email: userA.email, userId: userA.userId });
  console.log("B:", { email: userB.email, userId: userB.userId });
  console.log("tokens differ:", userA.token !== userB.token);

  console.log("\n=== seed one application each ===");
  const seedA = await seedOwnedApplication({
    userId: userA.userId,
    title: `Alpha Role ${stamp}`,
    externalId: `iso-a-${stamp}`,
  });
  const seedB = await seedOwnedApplication({
    userId: userB.userId,
    title: `Beta Role ${stamp}`,
    externalId: `iso-b-${stamp}`,
  });
  console.log("A applicationId:", seedA.application.id, "title:", seedA.job.title);
  console.log("B applicationId:", seedB.application.id, "title:", seedB.job.title);

  console.log("\n=== curl: A review-queue ===");
  const queueARes = await fetch(`${apiUrl}/applications/review-queue`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const queueABody = await queueARes.text();
  console.log("status:", queueARes.status);
  console.log("body:", queueABody);

  console.log("\n=== curl: B review-queue ===");
  const queueBRes = await fetch(`${apiUrl}/applications/review-queue`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const queueBBody = await queueBRes.text();
  console.log("status:", queueBRes.status);
  console.log("body:", queueBBody);

  console.log("\n=== curl: B PATCH A's application status (expect 404) ===");
  const crossRes = await fetch(
    `${apiUrl}/applications/${seedA.application.id}/status`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${userB.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "reviewing" }),
    },
  );
  const crossBody = await crossRes.text();
  console.log("status:", crossRes.status);
  console.log("body:", crossBody);

  console.log("\n=== curl: A PATCH own application (expect 200) ===");
  const ownRes = await fetch(
    `${apiUrl}/applications/${seedA.application.id}/status`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${userA.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "reviewing" }),
    },
  );
  const ownBody = await ownRes.text();
  console.log("status:", ownRes.status);
  console.log("body:", ownBody);

  const queueA = JSON.parse(queueABody) as {
    queue: Array<{ applicationId: string; title: string }>;
  };
  const queueB = JSON.parse(queueBBody) as {
    queue: Array<{ applicationId: string; title: string }>;
  };

  const aIds = new Set(queueA.queue.map((q) => q.applicationId));
  const bIds = new Set(queueB.queue.map((q) => q.applicationId));

  const ok =
    queueARes.status === 200 &&
    queueBRes.status === 200 &&
    aIds.has(seedA.application.id) &&
    !aIds.has(seedB.application.id) &&
    bIds.has(seedB.application.id) &&
    !bIds.has(seedA.application.id) &&
    crossRes.status === 404 &&
    ownRes.status === 200;

  // cleanup seeds (leave auth users)
  await db.delete(applications).where(eq(applications.id, seedA.application.id));
  await db.delete(applications).where(eq(applications.id, seedB.application.id));
  await db.delete(matches).where(eq(matches.id, seedA.match.id));
  await db.delete(matches).where(eq(matches.id, seedB.match.id));
  await db.delete(jobs).where(eq(jobs.id, seedA.job.id));
  await db.delete(jobs).where(eq(jobs.id, seedB.job.id));
  await db.delete(profiles).where(eq(profiles.id, seedA.profile.id));
  await db.delete(profiles).where(eq(profiles.id, seedB.profile.id));

  if (!ok) {
    console.error("\nPROOF FAILED");
    process.exit(1);
  }
  console.log(
    "\nPROOF OK: queues isolated; B gets 404 on A's applicationId; A can update own",
  );
}

void main();
