import { and, cosineDistance, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { applications, jobs, matches } from "../db/schema";
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

export type IngestJobsResult = {
  jobIds: string[];
  jobsSeen: number;
  embeddingsCreated: number;
  profileEmbedding: number[];
  adzunaDebug: {
    requestUrl: string;
    rawResponse: string;
  };
};

export type ScoreMatchResult = {
  matchesCreated: number;
  matchesReused: number;
  applicationsCreated: number;
  claudeCalls: number;
  result: JobSearchResultItem;
};

/** Adzuna fetch + upsert jobs + ensure embeddings. Shared by search-run worker. */
export async function ingestJobsForProfile(
  profile: ResolvedProfile,
): Promise<IngestJobsResult> {
  const profileEmbedding = await generateEmbedding(
    buildProfileEmbeddingText(profile),
  );

  const adzunaResult = await searchAdzuna(profile);
  const jobIds: string[] = [];
  let jobsSeen = 0;
  let embeddingsCreated = 0;

  for (const adzunaJob of adzunaResult.jobs) {
    jobsSeen += 1;

    let job = (
      await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.source, adzunaJob.source),
            eq(jobs.externalId, adzunaJob.externalId),
          ),
        )
        .limit(1)
    )[0];

    if (!job) {
      const [inserted] = await db
        .insert(jobs)
        .values({
          ...adzunaJob,
          postedAt: adzunaJob.postedAt ? new Date(adzunaJob.postedAt) : null,
          salaryMin:
            adzunaJob.salaryMin !== null && adzunaJob.salaryMin !== undefined
              ? Math.round(adzunaJob.salaryMin)
              : null,
          salaryMax:
            adzunaJob.salaryMax !== null && adzunaJob.salaryMax !== undefined
              ? Math.round(adzunaJob.salaryMax)
              : null,
        })
        .returning();
      job = inserted;
    }

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

    jobIds.push(job.id);
  }

  return {
    jobIds,
    jobsSeen,
    embeddingsCreated,
    profileEmbedding,
    adzunaDebug: {
      requestUrl: adzunaResult.redactedUrl,
      rawResponse: adzunaResult.rawResponseText,
    },
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
        and(eq(applications.jobId, job.id), eq(applications.matchId, match.id)),
      )
      .limit(1)
  )[0];

  let applicationsCreated = 0;
  if (!existingApplication) {
    await db.insert(applications).values({
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
  adzunaDebug: { requestUrl: string; rawResponse: string };
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
    results.push(scored.result);
  }

  return {
    profileId: profile.id,
    profileReused,
    stats,
    results,
    adzunaDebug: ingest.adzunaDebug,
  };
}
