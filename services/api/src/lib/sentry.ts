import * as Sentry from "@sentry/node";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvPath = resolve(__dirname, "..", "..", "..", "..", ".env");
config({ path: dotenvPath, override: true });

export type SentryProcess = "api" | "worker";

let initialized = false;

export function initSentry(processName: SentryProcess): boolean {
  if (initialized) {
    return Boolean(process.env.SENTRY_DSN?.trim());
  }

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    console.log(
      JSON.stringify({
        event: "sentry.disabled",
        process: processName,
        reason: "SENTRY_DSN unset",
      }),
    );
    initialized = true;
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || "development",
    tracesSampleRate: 0,
    initialScope: {
      tags: { process: processName },
    },
  });

  initialized = true;
  console.log(
    JSON.stringify({
      event: "sentry.initialized",
      process: processName,
      environment: process.env.SENTRY_ENVIRONMENT?.trim() || "development",
    }),
  );
  return true;
}

export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
): string | undefined {
  if (!process.env.SENTRY_DSN?.trim()) {
    return undefined;
  }

  return Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extra) {
      scope.setExtras(context.extra);
    }
    return Sentry.captureException(error);
  });
}

export function captureProviderError(
  provider: "claude" | "adzuna" | "openai" | "jooble",
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  captureException(error, {
    tags: { provider },
    extra,
  });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN?.trim()) {
    return;
  }
  await Sentry.flush(timeoutMs);
}

export { Sentry };
