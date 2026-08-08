import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";

export const PIPELINE_QUEUE_NAME = "pipeline";

export type HelloJobData = {
  message: string;
  requestedAt: string;
};

export type SearchRunJobData = {
  runId: string;
  profileId: string;
};

export type ScoreMatchJobData = {
  runId: string;
  profileId: string;
  jobId: string;
  profileEmbedding: number[];
};

let pipelineQueue: Queue | null = null;

export function createPipelineQueue(): Queue {
  return new Queue(PIPELINE_QUEUE_NAME, {
    connection: createRedisConnection(),
  });
}

/** Shared queue instance for the API process (enqueue only). */
export function getPipelineQueue(): Queue {
  if (!pipelineQueue) {
    pipelineQueue = createPipelineQueue();
  }
  return pipelineQueue;
}
