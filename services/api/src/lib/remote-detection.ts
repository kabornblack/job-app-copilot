/**
 * Derives remote/hybrid status from a job's location and description text.
 * Replaces the previous (wrong) mapping in adzuna.ts/jooble.ts, which wrote
 * employment-type fields (Adzuna's contract_type, Jooble's type - permanent/
 * contract/Full-time/Part-time) into remoteType. Neither provider's parsed
 * result shape has a genuine structured remote-status field, so this is a
 * best-effort text derivation, not a guarantee - see the location gate
 * (Part B) for how a null/undetected result is handled downstream.
 */

export type DerivedRemoteType = "remote" | "hybrid" | null;

// Checked first, both fields. A false positive here is the one place a
// wrong-location job could wrongly pass the location gate (Part B) - the
// direction that actually costs a Claude call - so this list exists purely
// to catch the most common ways a listing explicitly rules remote out,
// even though it can't catch every phrasing.
const NEGATION_KEYWORDS = [
  "no remote",
  "not remote",
  "remote work is not",
  "must be on-site",
  "must be onsite",
  "on-site only",
  "onsite only",
];

// Deliberately short and specific, not broad - a broad list raises false-
// positive risk in exactly the direction the negation guard above exists
// to prevent.
const REMOTE_KEYWORDS = [
  "remote",
  "work from home",
  "wfh",
  "fully remote",
  "100% remote",
];

const HYBRID_KEYWORDS = ["hybrid"];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function deriveRemoteType(input: {
  location: string | null;
  description: string | null;
}): DerivedRemoteType {
  const location = (input.location ?? "").toLowerCase();
  const description = (input.description ?? "").toLowerCase();

  if (
    includesAny(location, NEGATION_KEYWORDS) ||
    includesAny(description, NEGATION_KEYWORDS)
  ) {
    return null;
  }

  if (includesAny(location, REMOTE_KEYWORDS)) {
    return "remote";
  }

  if (includesAny(description, HYBRID_KEYWORDS)) {
    return "hybrid";
  }

  if (includesAny(description, REMOTE_KEYWORDS)) {
    return "remote";
  }

  return null;
}
