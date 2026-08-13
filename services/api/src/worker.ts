import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { initSentry, captureException, flushSentry } from "./lib/sentry";
import { db } from "./db/client";
import { profiles } from "./db/schema";
import { enqueueCronSearchIfActiveProfile } from "./lib/daily-search";
import { ingestJobsForProfile, scoreMatchForJob } from "./lib/job-search";
import {
  markSearchRunFailed,
  markSearchRunCompleted,
  markSearchRunRunning,
  patchSearchRunStats,
  recordScoreMatchProgress,
} from "./lib/search-runs";
import { createRedisConnection } from "./queue/connection";
import { registerDailySearchScheduler } from "./queue/daily-scheduler";
import {
  PIPELINE_QUEUE_NAME,
  createPipelineQueue,
  type HelloJobData,
  type ScoreMatchJobData,
  type SearchRunJobData,
} from "./queue/queues";

initSentry("worker");

const connection = createRedisConnection();
const queue = createPipelineQueue();

await registerDailySearchScheduler(queue);

const worker = new Worker(
  PIPELINE_QUEUE_NAME,
  async (job) => {
    const startedAt = Date.now();
    const logData =
      job.name === "score-match"
        ? {
            runId: (job.data as ScoreMatchJobData).runId,
            profileId: (job.data as ScoreMatchJobData).profileId,
            jobId: (job.data as ScoreMatchJobData).jobId,
          }
        : job.data;
    console.log(
      JSON.stringify({
        event: "job.started",
        queue: PIPELINE_QUEUE_NAME,
        name: job.name,
        id: job.id,
        attempt: job.attemptsMade + 1,
        data: logData,
      }),
    );

    try {
      if (job.name === "hello") {
        const data = job.data as HelloJobData;
        const result = {
          ok: true as const,
          echo: data.message,
          requestedAt: data.requestedAt,
          completedAt: new Date().toISOString(),
        };
        console.log(
          JSON.stringify({
            event: "job.completed",
            queue: PIPELINE_QUEUE_NAME,
            name: job.name,
            id: job.id,
            durationMs: Date.now() - startedAt,
            result,
          }),
        );
        return result;
      }

      if (job.name === "daily-search") {
        const result = await enqueueCronSearchIfActiveProfile(queue);
        console.log(
          JSON.stringify({
            event: "job.completed",
            queue: PIPELINE_QUEUE_NAME,
            name: job.name,
            id: job.id,
            durationMs: Date.now() - startedAt,
            result,
          }),
        );
        return result;
      }

      if (job.name === "search-run") {
        const data = job.data as SearchRunJobData;
        await markSearchRunRunning(data.runId);

        const [profile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, data.profileId))
          .limit(1);

        if (!profile) {
          throw new Error(`Profile not found: ${data.profileId}`);
        }

        const ingest = await ingestJobsForProfile(profile);

        await patchSearchRunStats(data.runId, {
          jobsSeen: ingest.jobsSeen,
          embeddingsCreated: ingest.embeddingsCreated,
          scoreJobsEnqueued: ingest.jobIds.length,
          sourceErrors: ingest.sourceErrors,
        });

        if (ingest.jobIds.length === 0) {
          await markSearchRunCompleted(data.runId);
          console.log(
            JSON.stringify({
              event: "job.completed",
              queue: PIPELINE_QUEUE_NAME,
              name: job.name,
              id: job.id,
              durationMs: Date.now() - startedAt,
              result: { runId: data.runId, jobsSeen: 0 },
            }),
          );
          return { runId: data.runId, jobsSeen: 0, enqueued: 0 };
        }

        await queue.addBulk(
          ingest.jobIds.map((jobId) => ({
            name: "score-match",
            data: {
              runId: data.runId,
              profileId: data.profileId,
              jobId,
              profileEmbedding: ingest.profileEmbedding,
            } satisfies ScoreMatchJobData,
            opts: {
              jobId: `score-match-${data.runId}-${jobId}`,
              attempts: 3,
              backoff: { type: "exponential", delay: 2000 },
              removeOnComplete: 1000,
              removeOnFail: 1000,
            },
          })),
        );

        console.log(
          JSON.stringify({
            event: "job.completed",
            queue: PIPELINE_QUEUE_NAME,
            name: job.name,
            id: job.id,
            durationMs: Date.now() - startedAt,
            result: {
              runId: data.runId,
              jobsSeen: ingest.jobsSeen,
              enqueued: ingest.jobIds.length,
            },
          }),
        );
        return {
          runId: data.runId,
          jobsSeen: ingest.jobsSeen,
          enqueued: ingest.jobIds.length,
        };
      }

      if (job.name === "score-match") {
        const data = job.data as ScoreMatchJobData;

        const [profile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, data.profileId))
          .limit(1);

        if (!profile) {
          throw new Error(`Profile not found: ${data.profileId}`);
        }

        const scored = await scoreMatchForJob({
          profile,
          jobId: data.jobId,
          profileEmbedding: data.profileEmbedding,
        });

        const progress = await recordScoreMatchProgress(data.runId, {
          matchesCreated: scored.matchesCreated,
          matchesReused: scored.matchesReused,
          applicationsCreated: scored.applicationsCreated,
          claudeCalls: scored.claudeCalls,
          quotaSkipped: scored.quotaSkipped,
        });

        console.log(
          JSON.stringify({
            event: "job.completed",
            queue: PIPELINE_QUEUE_NAME,
            name: job.name,
            id: job.id,
            durationMs: Date.now() - startedAt,
            result: {
              runId: data.runId,
              jobId: data.jobId,
              runStatus: progress.status,
              runFinished: progress.finished,
            },
          }),
        );
        return {
          runId: data.runId,
          jobId: data.jobId,
          ...scored,
          runStatus: progress.status,
        };
      }

      throw new Error(`Unknown job name: ${job.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (job.name === "search-run") {
        const data = job.data as SearchRunJobData;
        await markSearchRunFailed(data.runId, message);
      }

      if (job.name === "score-match") {
        const data = job.data as ScoreMatchJobData;
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 >= maxAttempts) {
          await recordScoreMatchProgress(data.runId, { failed: true });
        }
      }

      console.error(
        JSON.stringify({
          event: "job.failed",
          queue: PIPELINE_QUEUE_NAME,
          name: job.name,
          id: job.id,
          attempt: job.attemptsMade + 1,
          error: message,
        }),
      );
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 120_000,
  },
);

worker.on("failed", (job, error) => {
  const data = job?.data as Record<string, unknown> | undefined;
  const sanitizedExtra = data
    ? {
        runId: data.runId,
        profileId: data.profileId,
        jobId: data.jobId,
        applicationId: data.applicationId,
        message: data.message,
      }
    : undefined;

  const eventId = captureException(error, {
    tags: {
      jobName: job?.name ?? "unknown",
      bullJobId: job?.id ?? "unknown",
    },
    extra: {
      attempt: job?.attemptsMade,
      ...sanitizedExtra,
    },
  });
  void flushSentry();

  console.error(
    JSON.stringify({
      event: "worker.failed",
      queue: PIPELINE_QUEUE_NAME,
      name: job?.name,
      id: job?.id,
      attempt: job?.attemptsMade,
      error: error.message,
      sentryEventId: eventId,
    }),
  );
});

console.log(
  JSON.stringify({
    event: "worker.started",
    queue: PIPELINE_QUEUE_NAME,
    redisUrlSet: Boolean(process.env.REDIS_URL),
  }),
);

async function shutdown(signal: string) {
  console.log(JSON.stringify({ event: "worker.shutdown", signal }));
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
