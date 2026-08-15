import { computeJobFingerprint } from "./job-fingerprint";
import { deriveRemoteType } from "./remote-detection";
import { captureProviderError } from "./sentry";

const US_STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY",
]);

/**
 * Jooble silently resolves an ambiguous bare city name (no country/state
 * qualifier) to a same-named US town instead of erroring - confirmed live:
 * requesting location="London" returns "London, KY"/"Public, KY" results,
 * while location="London, UK" correctly returns UK results. It never
 * signals the mismatch; the wrong-country result just looks like a normal
 * match. Detected here by checking whether the resolved location ends in a
 * US state abbreviation that the requested location never asked for.
 */
export function isUntrustedUsStateResolution(
  resolvedLocation: string | null,
  requestedLocation: string,
): boolean {
  if (!resolvedLocation) {
    return false;
  }
  const match = resolvedLocation.trim().match(/,\s*([A-Za-z]{2})$/);
  if (!match) {
    return false;
  }
  const stateCode = match[1].toUpperCase();
  if (!US_STATE_ABBREVIATIONS.has(stateCode)) {
    return false;
  }
  const requestedTokens = requestedLocation.toUpperCase().split(/[\s,]+/);
  const requestedLower = requestedLocation.toLowerCase();
  return (
    !requestedTokens.includes(stateCode) &&
    !requestedLower.includes("usa") &&
    !requestedLower.includes("united states")
  );
}

export interface JoobleProfile {
  skills: string[];
  targetRoles: string[];
  locations: string[];
  remotePref: string | null;
  resumeSummary?: string | null;
}

export interface JoobleJob {
  source: "jooble";
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
}

export interface JoobleResult {
  id: string | number;
  title?: string;
  location?: string | null;
  snippet?: string | null;
  salary?: string | null;
  type?: string | null;
  link?: string;
  company?: string | null;
  updated?: string | null;
}

export function parseJoobleResult(result: JoobleResult): JoobleJob {
  const title = result.title?.trim() ?? "Unknown title";
  const company = result.company?.trim() || "Unknown company";
  const location = result.location?.trim() || null;
  const description = result.snippet?.trim() || null;
  // result.type is employment type (Full-time/Part-time/Temporary), not
  // remote status - Jooble has no genuine structured remote-status field
  // in the shape we parse, so this is derived from text instead.
  const remoteType = deriveRemoteType({ location, description });
  const externalId = String(result.id);
  const fingerprint = computeJobFingerprint({ title, company, location });
  const { salaryMin, salaryMax } = parseJoobleSalary(result.salary);

  return {
    source: "jooble",
    externalId,
    fingerprint,
    title,
    company,
    location,
    remoteType,
    salaryMin,
    salaryMax,
    description,
    url: result.link?.trim() || `https://jooble.org/desc/${externalId}`,
    postedAt: result.updated ?? null,
  };
}

/** Best-effort parse of Jooble's free-text salary field. */
export function parseJoobleSalary(salary: string | null | undefined): {
  salaryMin: number | null;
  salaryMax: number | null;
} {
  if (!salary?.trim()) {
    return { salaryMin: null, salaryMax: null };
  }

  const numbers = [...salary.matchAll(/(\d[\d\s,]*)/g)]
    .map((match) => Number(match[1].replace(/[\s,]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numbers.length === 0) {
    return { salaryMin: null, salaryMax: null };
  }
  if (numbers.length === 1) {
    return { salaryMin: numbers[0], salaryMax: numbers[0] };
  }
  return {
    salaryMin: Math.min(numbers[0], numbers[1]),
    salaryMax: Math.max(numbers[0], numbers[1]),
  };
}

export interface JoobleDebugResult {
  jobs: JoobleJob[];
  requestUrl: string;
  rawResponseText: string;
}

export async function searchJooble(
  profile: JoobleProfile,
): Promise<JoobleDebugResult> {
  const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY;
  if (!JOOBLE_API_KEY) {
    throw new Error("JOOBLE_API_KEY is required for Jooble integration");
  }

  // keywords is built from targetRoles only, not skills - same fix as
  // adzuna.ts's `what=` and for the same reason: folding in a full skills
  // list (often 15-25+ terms) turns this into an overly specific query that
  // reliably returns zero results. profile.skills is intentionally unused
  // here - it's still passed to Claude's scoring prompt in full elsewhere.
  const keywords = profile.targetRoles
    .map((term) => term.trim())
    .filter(Boolean)
    .join(", ");

  const location = profile.locations[0]?.trim() || "";
  const requestUrl = `https://jooble.org/api/${JOOBLE_API_KEY}`;
  const redactedUrl = "https://jooble.org/api/REDACTED";

  const body = {
    keywords: keywords || "software engineer",
    location,
    page: "1",
  };

  console.log("Jooble request URL (redacted):", redactedUrl);
  console.log("Jooble request body:", JSON.stringify(body));

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  console.log("Jooble raw response:", responseText.slice(0, 2000));

  if (!response.ok) {
    const error = new Error(
      `Jooble search failed: ${response.status} ${response.statusText}`,
    );
    captureProviderError("jooble", error, { status: response.status });
    throw error;
  }

  let payload: { jobs?: JoobleResult[] };
  try {
    // Jooble ids are int64; JSON.parse would lose precision as JS Number.
    const withStringIds = responseText.replace(
      /"id"\s*:\s*(-?\d+)\s*/g,
      '"id":"$1"',
    );
    payload = JSON.parse(withStringIds) as { jobs?: JoobleResult[] };
  } catch (error) {
    captureProviderError("jooble", error, { reason: "invalid_json" });
    throw error;
  }

  const jobs = (payload.jobs ?? []).map(parseJoobleResult).map((job) => {
    if (!isUntrustedUsStateResolution(job.location, location)) {
      return job;
    }
    // Don't let a resolved location that doesn't correspond to what was
    // requested count as location data at all - null it out rather than
    // trust it, so it can't wrongly satisfy the location gate's "matches
    // candidate location" check. Re-derive remoteType too, since it was
    // computed from the now-discarded location string.
    return {
      ...job,
      location: null,
      remoteType: deriveRemoteType({ location: null, description: job.description }),
    };
  });
  return {
    jobs,
    requestUrl: redactedUrl,
    rawResponseText: responseText,
  };
}
