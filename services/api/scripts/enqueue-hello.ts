import { QueueEvents } from "bullmq";
import { createRedisConnection } from "../src/queue/connection";
import { createPipelineQueue } from "../src/queue/queues";

async function main() {
  const queue = createPipelineQueue();
  const events = new QueueEvents("pipeline", {
    connection: createRedisConnection(),
  });
  await events.waitUntilReady();

  const requestedAt = new Date().toISOString();
  const job = await queue.add(
    "hello",
    { message: "hello-from-slice-1", requestedAt },
    { removeOnComplete: 100, removeOnFail: 100 },
  );

  console.log(
    JSON.stringify({
      event: "hello.enqueued",
      jobId: job.id,
      name: job.name,
      data: { message: "hello-from-slice-1", requestedAt },
    }),
  );

  const result = await job.waitUntilFinished(events, 15_000);
  console.log(JSON.stringify({ event: "hello.finished", jobId: job.id, result }));

  await events.close();
  await queue.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
