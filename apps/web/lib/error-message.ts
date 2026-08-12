/**
 * Shared parsing for API error response bodies. The Fastify API's global
 * error handler (services/api/src/index.ts) sends plain `{ error: "..." }`
 * for most errors, but Zod validation failures send
 * `{ error: ZodError.flatten() }` instead — i.e. `error` is itself an
 * object shaped `{ formErrors: string[], fieldErrors: Record<string,
 * string[]> }`, not a string. Passing that object straight into
 * `new Error(...)` or a template literal silently stringifies it to the
 * literal text "[object Object]" instead of showing the real validation
 * message. This is the one place that turns either response shape into a
 * readable string — used by every profile-knowledge API call and by
 * ProfileForm's job-search submit, so fixing it here fixes both at once.
 */

type ZodFlattenedError = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

function isZodFlattenedError(value: unknown): value is ZodFlattenedError {
  return (
    typeof value === "object" &&
    value !== null &&
    ("formErrors" in value || "fieldErrors" in value)
  );
}

function formatZodFlattenedError(flat: ZodFlattenedError): string {
  const parts: string[] = [...(flat.formErrors ?? [])];
  for (const [field, messages] of Object.entries(flat.fieldErrors ?? {})) {
    if (messages && messages.length > 0) {
      parts.push(`${field}: ${messages.join(", ")}`);
    }
  }
  return parts.join("; ");
}

/**
 * Extracts a human-readable message from a raw API error response body.
 * Never returns a stringified object/array — falls back to `fallback` for
 * any response shape it doesn't recognize as either a plain string error
 * or a Zod-flattened validation error.
 */
export function extractErrorMessage(rawBody: string, fallback: string): string {
  if (!rawBody) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawBody) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    if (isZodFlattenedError(parsed.error)) {
      return formatZodFlattenedError(parsed.error) || fallback;
    }
    if (parsed.error != null) {
      // Valid JSON, but not a shape we know how to render as text — never
      // stringify it raw (that's how "[object Object]" happens).
      return fallback;
    }
  } catch {
    // Not JSON (e.g. a proxy/plaintext error page). A short body is still
    // worth showing as-is; a long one is almost certainly HTML, not a
    // message meant for a user.
    if (rawBody.length < 300) {
      return rawBody;
    }
  }
  return fallback;
}
