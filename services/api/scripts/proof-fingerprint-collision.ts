/**
 * Prove cross-source dedup: real Jooble listing + Adzuna twin with same
 * title/company/location → one jobs row, two job_source_listings.
 *
 * pnpm --filter ./services/api exec tsx scripts/proof-fingerprint-collision.ts
 */
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { db } from "../src/db/client";
import { jobSourceListings, jobs } from "../src/db/schema";
import { searchJooble } from "../src/lib/jooble";
import { upsertJobFromListing } from "../src/lib/job-search";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

async function main() {
  const joobleResult = await searchJooble({
    skills: ["TypeScript"],
    targetRoles: ["Software Engineer"],
    locations: ["United Kingdom"],
    remotePref: "any",
  });

  const joobleJob = joobleResult.jobs[0];
  if (!joobleJob) {
    throw new Error("Jooble returned no jobs for United Kingdom proof query");
  }

  const proofTag = `proof-${Date.now()}`;
  const adzunaTwin = {
    source: "adzuna",
    externalId: `${proofTag}-adzuna`,
    fingerprint: joobleJob.fingerprint,
    title: joobleJob.title,
    company: joobleJob.company,
    location: joobleJob.location,
    remoteType: joobleJob.remoteType,
    salaryMin: joobleJob.salaryMin,
    salaryMax: joobleJob.salaryMax,
    description: joobleJob.description,
    url: `https://adzuna.example/proof/${proofTag}`,
    postedAt: joobleJob.postedAt,
  };

  console.log("--- input listings ---");
  console.log(
    JSON.stringify(
      {
        adzuna: {
          source: adzunaTwin.source,
          externalId: adzunaTwin.externalId,
          title: adzunaTwin.title,
          company: adzunaTwin.company,
          location: adzunaTwin.location,
          fingerprint: adzunaTwin.fingerprint,
          url: adzunaTwin.url,
        },
        jooble: {
          source: joobleJob.source,
          externalId: joobleJob.externalId,
          title: joobleJob.title,
          company: joobleJob.company,
          location: joobleJob.location,
          fingerprint: joobleJob.fingerprint,
          url: joobleJob.url,
        },
      },
      null,
      2,
    ),
  );

  const first = await upsertJobFromListing(adzunaTwin);
  const second = await upsertJobFromListing(joobleJob);

  console.log("\n--- upsert results ---");
  console.log(
    JSON.stringify(
      {
        adzunaUpsert: first,
        joobleUpsert: second,
        sameJobId: first.jobId === second.jobId,
        joobleFingerprintMatched: second.fingerprintMatched,
      },
      null,
      2,
    ),
  );

  const [jobRow] = await db
    .select({
      id: jobs.id,
      source: jobs.source,
      externalId: jobs.externalId,
      fingerprint: jobs.fingerprint,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      url: jobs.url,
    })
    .from(jobs)
    .where(eq(jobs.id, first.jobId))
    .limit(1);

  const listings = await db
    .select({
      id: jobSourceListings.id,
      jobId: jobSourceListings.jobId,
      source: jobSourceListings.source,
      externalId: jobSourceListings.externalId,
      url: jobSourceListings.url,
    })
    .from(jobSourceListings)
    .where(eq(jobSourceListings.jobId, first.jobId));

  const jobCountForFingerprint = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.fingerprint, joobleJob.fingerprint));

  console.log("\n--- canonical jobs row ---");
  console.log(JSON.stringify(jobRow, null, 2));
  console.log("\n--- job_source_listings for that job_id ---");
  console.log(JSON.stringify(listings, null, 2));
  console.log(
    "\njobs rows with this fingerprint:",
    jobCountForFingerprint[0]?.n,
  );

  const sources = new Set(listings.map((l) => l.source));
  const ok =
    first.jobId === second.jobId &&
    second.fingerprintMatched === true &&
    listings.length === 2 &&
    sources.has("adzuna") &&
    sources.has("jooble") &&
    jobCountForFingerprint[0]?.n === 1;

  // Cleanup proof Adzuna twin listing + job only if it was created solely for proof
  // (keep Jooble listing tied to the job if we leave the job — cleaner to delete job cascade)
  await db
    .delete(jobs)
    .where(
      and(eq(jobs.source, "adzuna"), eq(jobs.externalId, adzunaTwin.externalId)),
    );

  if (!ok) {
    console.error("\nPROOF FAILED");
    process.exit(1);
  }
  console.log(
    "\nPROOF OK: one jobs row, two listings (adzuna+jooble), fingerprint match on second upsert",
  );
}

void main();
