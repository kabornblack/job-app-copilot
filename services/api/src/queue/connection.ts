import { config } from "dotenv";
import { Redis } from "ioredis";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvPath = resolve(__dirname, "..", "..", "..", "..", ".env");
config({ path: dotenvPath, override: true });

export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required");
  }
  return url;
}

/** BullMQ requires maxRetriesPerRequest: null on the ioredis connection. */
export function createRedisConnection(): Redis {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });
}
