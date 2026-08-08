import crypto from "crypto";
import { captureProviderError } from "./sentry";

export interface AdzunaProfile {
  skills: string[];
  targetRoles: string[];
  locations: string[];
  remotePref: string;
  resumeSummary?: string;
}

export interface AdzunaJob {
  source: "adzuna";
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

export interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string } | null;
  contract_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  redirect_url: string;
  created?: string | null;
}

export function parseAdzunaResult(result: AdzunaResult): AdzunaJob {
  const title = result.title?.trim() ?? "Unknown title";
  const company = result.company?.display_name?.trim() ?? "Unknown company";
  const location = result.location?.display_name?.trim() ?? null;
  const remoteType = result.contract_type?.trim() ?? null;
  const externalId = result.id;
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${externalId}:${title}:${company}:${location ?? ""}`)
    .digest("hex");

  return {
    source: "adzuna",
    externalId,
    fingerprint,
    title,
    company,
    location,
    remoteType,
    salaryMin: result.salary_min ?? null,
    salaryMax: result.salary_max ?? null,
    description: result.description ?? null,
    url: result.redirect_url,
    postedAt: result.created ?? null,
  };
}

export interface AdzunaDebugResult {
  jobs: AdzunaJob[];
  rawUrl: string;
  redactedUrl: string;
  rawResponseText: string;
}

export async function searchAdzuna(
  profile: AdzunaProfile,
): Promise<AdzunaDebugResult> {
  const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
  const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    throw new Error(
      "ADZUNA_APP_ID and ADZUNA_APP_KEY are required for Adzuna integration",
    );
  }

  const query = [...profile.targetRoles, ...profile.skills]
    .map((term) => term.trim())
    .filter(Boolean)
    .join(" ");

  const { country: supportedCountry, keepWhere } = deriveAdzunaCountry(
    profile.locations,
  );
  const baseUrl = `https://api.adzuna.com/v1/api/jobs/${supportedCountry}/search/1`;

  const url = new URL(baseUrl);
  url.searchParams.set("app_id", ADZUNA_APP_ID);
  url.searchParams.set("app_key", ADZUNA_APP_KEY);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  if (query) {
    url.searchParams.set("what", query);
  }

  if (keepWhere && profile.locations.length > 0) {
    url.searchParams.set("where", profile.locations[0]);
  }

  // Redact only the app_key value for logging/returning
  const rawUrl = url.toString();
  const redactedUrlObj = new URL(rawUrl);
  if (redactedUrlObj.searchParams.has("app_key")) {
    redactedUrlObj.searchParams.set("app_key", "REDACTED");
  }
  const redactedUrl = redactedUrlObj.toString();

  console.log("Adzuna request URL (redacted):", redactedUrl);

  const response = await fetch(rawUrl);
  const responseText = await response.text();

  // Log the raw response body before parsing
  console.log("Adzuna raw response:", responseText);

  if (!response.ok) {
    const error = new Error(
      `Adzuna search failed: ${response.status} ${response.statusText}`,
    );
    captureProviderError("adzuna", error, { status: response.status });
    throw error;
  }

  const payload =
    (JSON.parse(responseText) as { results?: AdzunaResult[] }) ?? {};

  const jobs = (payload.results ?? []).map(parseAdzunaResult);

  return { jobs, rawUrl, redactedUrl, rawResponseText: responseText };
}

const supportedAdzunaCountries = [
  "at",
  "au",
  "be",
  "br",
  "ca",
  "ch",
  "de",
  "es",
  "fr",
  "gb",
  "in",
  "it",
  "mx",
  "nl",
  "nz",
  "pl",
  "sg",
  "us",
  "za",
] as const;

type SupportedAdzunaCountry = (typeof supportedAdzunaCountries)[number];

export function deriveAdzunaCountry(locations: string[]): {
  country: SupportedAdzunaCountry;
  keepWhere: boolean;
} {
  if (locations.length === 0) {
    return { country: "gb", keepWhere: false };
  }

  const location = locations[0].trim().toLowerCase();

  const explicitMap: Record<string, SupportedAdzunaCountry> = {
    austria: "at",
    australien: "au",
    australia: "au",
    belgium: "be",
    brasil: "br",
    brazil: "br",
    canada: "ca",
    schweiz: "ch",
    suisse: "ch",
    switzerland: "ch",
    deutschland: "de",
    germany: "de",
    espana: "es",
    españa: "es",
    spain: "es",
    france: "fr",
    "united kingdom": "gb",
    uk: "gb",
    "great britain": "gb",
    britain: "gb",
    england: "gb",
    scotland: "gb",
    wales: "gb",
    ireland: "gb",
    india: "in",
    italien: "it",
    italy: "it",
    mexico: "mx",
    netherlands: "nl",
    holland: "nl",
    "new zealand": "nz",
    poland: "pl",
    singapore: "sg",
    "united states": "us",
    usa: "us",
    us: "us",
    "south africa": "za",
    "s. africa": "za",
  };

  for (const [key, country] of Object.entries(explicitMap)) {
    if (location.includes(key)) {
      return { country, keepWhere: true };
    }
  }

  const locationCode = location.slice(-2);
  if (
    supportedAdzunaCountries.includes(locationCode as SupportedAdzunaCountry)
  ) {
    return {
      country: locationCode as SupportedAdzunaCountry,
      keepWhere: true,
    };
  }

  console.warn(
    "Adzuna location fallback: unsupported location, defaulting to gb for",
    locations[0],
  );

  return { country: "gb", keepWhere: false };
}
