import { and, cosineDistance, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  applications,
  jobSourceListings,
  jobs,
  matches,
} from "../db/schema";
import { searchAdzuna, type AdzunaJob } from "./adzuna";
import {
  CLAUDE_SCORE_MODEL_VERSION,
  scoreJobMatchWithClaude,
} from "./claude-score";
import {
  buildJobEmbeddingText,
  buildProfileEmbeddingText,
  generateEmbedding,
} from "./embeddings";
import { searchJooble } from "./jooble";
import { evaluateLocationGate } from "./location-gate";
import { consumeScoreCallQuota } from "./quota";
import type { ResolvedProfile } from "./resolve-profile";
import { scoreProfileJob } from "./score";

export type JobSearchResultItem = {
  jobId: string;
  score: number;
  explanation: string;
  ruleBasedScore: number;
  semanticSimilarity: number | null;
  status: string;
  scored: boolean;
};

export type JobSearchStats = {
  jobsSeen: number;
  matchesCreated: number;
  matchesReused: number;
  applicationsCreated: number;
  claudeCalls: number;
};

/** Normalized listing from any board before DB upsert. */
export type IngestJobListing = {
  source: string;
  externalId: string;
  fingerprint: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  url: string;
  postedAt: string | null;
};

export type UpsertJobResult = {
  jobId: string;
  created: boolean;
  fingerprintMatched: boolean;
};

export type IngestJobsResult = {
  jobIds: string[];
  jobsSeen: number;
  embeddingsCreated: number;
  /** Jobs upserted/embedded but excluded from jobIds by the location/
   * remote hard gate (location-gate.ts) - never enqueued for scoring. */
  jobsGatedByLocation: number;
  profileEmbedding: number[];
  sourceErrors: { source: string; message: string }[];
  adzunaDebug: {
    requestUrl: string;
    rawResponse: string;
  } | null;
  joobleDebug: {
    requestUrl: string;
    rawResponse: string;
  } | null;
};

export type ScoreMatchResult = {
  matchesCreated: number;
  matchesReused: number;
  applicationsCreated: number;
  claudeCalls: number;
  result: JobSearchResultItem | null;
  /** True when consumeScoreCallQuota's monthly safety backstop was hit and
   * this job was skipped rather than scored - result is null in that case. */
  quotaSkipped: boolean;
};

function toJobValues(listing: IngestJobListing) {
  return {
    source: listing.source,
    externalId: listing.externalId,
    fingerprint: listing.fingerprint,
    title: listing.title,
    company: listing.company,
    location: listing.location,
    remoteType: listing.remoteType,
    description: listing.description,
    url: listing.url,
    postedAt: listing.postedAt ? new Date(listing.postedAt) : null,
    salaryMin:
      listing.salaryMin !== null && listing.salaryMin !== undefined
        ? Math.round(listing.salaryMin)
        : null,
    salaryMax:
      listing.salaryMax !== null && listing.salaryMax !== undefined
        ? Math.round(listing.salaryMax)
        : null,
  };
}

async function upsertJobSourceListing(listing: {
  jobId: string;
  source: string;
  externalId: string;
  url: string;
}): Promise<void> {
  await db
    .insert(jobSourceListings)
    .values({
      jobId: listing.jobId,
      source: listing.source,
      externalId: listing.externalId,
      url: listing.url,
    })
    .onConflictDoUpdate({
      target: [jobSourceListings.source, jobSourceListings.externalId],
      set: {
        jobId: listing.jobId,
        url: listing.url,
      },
    });
}

/**
 * Upsert a board listing into canonical jobs + job_source_listings.
 * Lookup order: (source, external_id) → fingerprint → insert.
 */
export async function upsertJobFromListing(
  listing: IngestJobListing,
): Promise<UpsertJobResult> {
  let job = (
    await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.source, listing.source),
          eq(jobs.externalId, listing.externalId),
        ),
      )
      .limit(1)
  )[0];

  let created = false;
  let fingerprintMatched = false;

  if (!job) {
    const [byFingerprint] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.fingerprint, listing.fingerprint))
      .limit(1);

    if (byFingerprint) {
      job = byFingerprint;
      fingerprintMatched = true;
    } else {
      const [inserted] = await db
        .insert(jobs)
        .values(toJobValues(listing))
        .returning();
      job = inserted;
      created = true;
    }
  }

  await upsertJobSourceListing({
    jobId: job.id,
    source: listing.source,
    externalId: listing.externalId,
    url: listing.url,
  });

  return { jobId: job.id, created, fingerprintMatched };
}

/** Dual-source fetch + upsert jobs + ensure embeddings. Shared by search-run worker. */
export async function ingestJobsForProfile(
  profile: ResolvedProfile,
): Promise<IngestJobsResult> {
  const profileEmbedding = await generateEmbedding(
    buildProfileEmbeddingText(profile),
  );

  const [adzunaSettled, joobleSettled] = await Promise.allSettled([
    searchAdzuna(profile),
    searchJooble(profile),
  ]);

  const sourceErrors: { source: string; message: string }[] = [];
  const listings: IngestJobListing[] = [];
  let adzunaDebug: IngestJobsResult["adzunaDebug"] = null;
  let joobleDebug: IngestJobsResult["joobleDebug"] = null;

  if (adzunaSettled.status === "fulfilled") {
    adzunaDebug = {
      requestUrl: adzunaSettled.value.redactedUrl,
      rawResponse: adzunaSettled.value.rawResponseText,
    };
    listings.push(...adzunaSettled.value.jobs);
  } else {
    const message =
      adzunaSettled.reason instanceof Error
        ? adzunaSettled.reason.message
        : String(adzunaSettled.reason);
    sourceErrors.push({ source: "adzuna", message });
    console.error("Adzuna search failed during ingest:", message);
  }

  if (joobleSettled.status === "fulfilled") {
    joobleDebug = {
      requestUrl: joobleSettled.value.requestUrl,
      rawResponse: joobleSettled.value.rawResponseText,
    };
    listings.push(...joobleSettled.value.jobs);
  } else {
    const message =
      joobleSettled.reason instanceof Error
        ? joobleSettled.reason.message
        : String(joobleSettled.reason);
    sourceErrors.push({ source: "jooble", message });
    console.error("Jooble search failed during ingest:", message);
  }

  const jobIds: string[] = [];
  const seenJobIds = new Set<string>();
  let jobsSeen = 0;
  let embeddingsCreated = 0;
  let jobsGatedByLocation = 0;

  for (const listing of listings) {
    jobsSeen += 1;
    const upserted = await upsertJobFromListing(listing);

    let job = (
      await db.select().from(jobs).where(eq(jobs.id, upserted.jobId)).limit(1)
    )[0];

    if (!job) {
      throw new Error(`Job missing after upsert: ${upserted.jobId}`);
    }

    // Embedding generation stays unconditional even for jobs the location
    // gate below will exclude - it's a property of the job itself (shared,
    // reusable across every future profile that ever ingests this same
    // listing), not a cost specific to this candidate's search.
    if (!job.embedding) {
      const jobEmbedding = await generateEmbedding(
        buildJobEmbeddingText({
          title: job.title,
          description: job.description,
        }),
      );
      const [updatedJob] = await db
        .update(jobs)
        .set({ embedding: jobEmbedding })
        .where(eq(jobs.id, job.id))
        .returning();
      job = updatedJob;
      embeddingsCreated += 1;
    }

    if (seenJobIds.has(job.id)) {
      continue;
    }
    seenJobIds.add(job.id);

    // Location/remote hard gate - applied here, before jobIds.push, so a
    // job the candidate can't actually take never gets a score-match job
    // enqueued and never costs a Claude call, regardless of skills match.
    const gate = evaluateLocationGate(
      { location: job.location, remoteType: job.remoteType },
      profile.locations,
    );
    if (!gate.passes) {
      jobsGatedByLocation += 1;
      continue;
    }

    jobIds.push(job.id);
  }

  return {
    jobIds,
    jobsSeen,
    embeddingsCreated,
    jobsGatedByLocation,
    profileEmbedding,
    sourceErrors,
    adzunaDebug,
    joobleDebug,
  };
}

/** Score one job against a profile. Shared by score-match worker. */
export async function scoreMatchForJob(options: {
  profile: ResolvedProfile;
  jobId: string;
  profileEmbedding: number[];
}): Promise<ScoreMatchResult> {
  const { profile, jobId, profileEmbedding } = options;

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  let match = (
    await db
      .select()
      .from(matches)
      .where(and(eq(matches.jobId, job.id), eq(matches.profileId, profile.id)))
      .limit(1)
  )[0];

  const ruleBased = scoreProfileJob(profile, job as AdzunaJob);
  let scored = false;
  let matchesCreated = 0;
  let matchesReused = 0;
  let claudeCalls = 0;

  if (match) {
    matchesReused = 1;
  } else {
    // Scoring safety backstop: only consumed here, right before the Claude
    // call that actually costs money - never for reused matches above.
    const quota = await consumeScoreCallQuota(profile.userId);
    if (!quota.allowed) {
      return {
        matchesCreated: 0,
        matchesReused: 0,
        applicationsCreated: 0,
        claudeCalls: 0,
        result: null,
        quotaSkipped: true,
      };
    }

    const [similarityRow] = await db
      .select({
        similarity: sql<number>`1 - (${cosineDistance(jobs.embedding, profileEmbedding)})`,
      })
      .from(jobs)
      .where(eq(jobs.id, job.id))
      .limit(1);

    const semanticSimilarity =
      similarityRow?.similarity === null ||
      similarityRow?.similarity === undefined
        ? null
        : Number(similarityRow.similarity);

    const claudeScore = await scoreJobMatchWithClaude(
      {
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        description: job.description,
        url: job.url,
        postedAt: job.postedAt ? job.postedAt.toISOString() : null,
      },
      {
        skills: profile.skills,
        targetRoles: profile.targetRoles,
        locations: profile.locations,
        remotePref: profile.remotePref ?? "any",
        resumeSummary: profile.resumeSummary ?? undefined,
      },
    );
    claudeCalls = 1;
    scored = true;

    const [insertedMatch] = await db
      .insert(matches)
      .values({
        userId: profile.userId,
        jobId: job.id,
        profileId: profile.id,
        score: claudeScore.score.toFixed(1),
        explanation: claudeScore.explanation,
        semanticSimilarity:
          semanticSimilarity === null ? null : semanticSimilarity.toFixed(4),
        modelVersion: CLAUDE_SCORE_MODEL_VERSION,
      })
      .returning();
    match = insertedMatch;
    matchesCreated = 1;
  }

  const existingApplication = (
    await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, profile.userId),
          eq(applications.jobId, job.id),
          eq(applications.matchId, match.id),
        ),
      )
      .limit(1)
  )[0];

  let applicationsCreated = 0;
  if (!existingApplication) {
    await db.insert(applications).values({
      userId: profile.userId,
      jobId: job.id,
      matchId: match.id,
      status: "found",
    });
    applicationsCreated = 1;
  }

  return {
    matchesCreated,
    matchesReused,
    applicationsCreated,
    claudeCalls,
    result: {
      jobId: job.id,
      score: Number(match.score),
      explanation: match.explanation,
      ruleBasedScore: ruleBased.score,
      semanticSimilarity:
        match.semanticSimilarity === null
          ? null
          : Number(match.semanticSimilarity),
      status: existingApplication?.status ?? "found",
      scored,
    },
    quotaSkipped: false,
  };
}

/** Composes ingest + score for tests / tooling. Workers use the split functions. */
export async function runJobSearch(options: {
  profile: ResolvedProfile;
  profileReused: boolean;
}): Promise<{
  profileId: string;
  profileReused: boolean;
  stats: JobSearchStats;
  results: JobSearchResultItem[];
  adzunaDebug: { requestUrl: string; rawResponse: string } | null;
  joobleDebug: { requestUrl: string; rawResponse: string } | null;
  sourceErrors: { source: string; message: string }[];
  jobsGatedByLocation: number;
}> {
  const { profile, profileReused } = options;
  const ingest = await ingestJobsForProfile(profile);
  const results: JobSearchResultItem[] = [];
  const stats: JobSearchStats = {
    jobsSeen: ingest.jobsSeen,
    matchesCreated: 0,
    matchesReused: 0,
    applicationsCreated: 0,
    claudeCalls: 0,
  };

  for (const jobId of ingest.jobIds) {
    const scored = await scoreMatchForJob({
      profile,
      jobId,
      profileEmbedding: ingest.profileEmbedding,
    });
    stats.matchesCreated += scored.matchesCreated;
    stats.matchesReused += scored.matchesReused;
    stats.applicationsCreated += scored.applicationsCreated;
    stats.claudeCalls += scored.claudeCalls;
    // scored.result is null when the scoring safety backstop skipped this
    // job (quotaSkipped) - nothing to add to results in that case.
    if (scored.result) {
      results.push(scored.result);
    }
  }

  return {
    profileId: profile.id,
    profileReused,
    stats,
    results,
    adzunaDebug: ingest.adzunaDebug,
    joobleDebug: ingest.joobleDebug,
    sourceErrors: ingest.sourceErrors,
    jobsGatedByLocation: ingest.jobsGatedByLocation,
  };
}
