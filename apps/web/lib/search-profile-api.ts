import { apiFetch } from "./api";
import { extractErrorMessage } from "./error-message";

/**
 * Typed client for GET /profile (services/api/src/index.ts) — the active
 * job-search profile row (profiles table), distinct from the six Phase 7
 * profile-knowledge resources in profile-knowledge-api.ts, which is why
 * this lives in its own file rather than being folded into that one.
 */

export type SearchProfile = {
  id: string;
  userId: string;
  version: number;
  skills: string[];
  targetRoles: string[];
  locations: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  remotePref: string | null;
  resumeSummary: string | null;
  isActive: boolean;
  createdAt: string;
};

/** Returns null if the user has never run a search yet (no active profile). */
export async function getActiveSearchProfile(): Promise<SearchProfile | null> {
  const response = await apiFetch("/profile");
  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(extractErrorMessage(rawBody, "Failed to load saved profile"));
  }
  const data = (await response.json()) as Partial<SearchProfile>;
  return data.id ? (data as SearchProfile) : null;
}
