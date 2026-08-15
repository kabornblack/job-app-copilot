/**
 * Hard gate applied before a job is enqueued for Claude scoring - a job the
 * candidate can't actually take (wrong location, not remote, no clear
 * hybrid eligibility) never reaches Claude and never appears in the review
 * queue, regardless of skills-match quality. Wired into
 * ingestJobsForProfile (job-search.ts), right before jobIds.push.
 *
 * Depends on remote-detection.ts's deriveRemoteType having already run at
 * ingest time - remoteType here is expected to be "remote" | "hybrid" |
 * null, not the old (wrong) employment-type values.
 */

export type LocationGateResult = {
  passes: boolean;
  reason:
    | "remote"
    | "hybrid-location-match"
    | "hybrid-location-mismatch"
    | "location-match"
    | "no-signal-location-mismatch";
};

function locationMatches(
  jobLocation: string | null,
  profileLocations: string[],
): boolean {
  if (!jobLocation) {
    return false;
  }
  const jobLoc = jobLocation.toLowerCase();
  return profileLocations.some((location) => {
    const token = location.trim().toLowerCase();
    return token.length > 0 && jobLoc.includes(token);
  });
}

export function evaluateLocationGate(
  job: { location: string | null; remoteType: string | null },
  profileLocations: string[],
): LocationGateResult {
  // Fully remote passes regardless of location - the whole point of remote
  // work is that location doesn't matter.
  if (job.remoteType === "remote") {
    return { passes: true, reason: "remote" };
  }

  const matchesLocation = locationMatches(job.location, profileLocations);

  // Hybrid still requires physical presence - only passes if location
  // actually matches.
  if (job.remoteType === "hybrid") {
    return matchesLocation
      ? { passes: true, reason: "hybrid-location-match" }
      : { passes: false, reason: "hybrid-location-mismatch" };
  }

  // remoteType is null - genuinely unclear/untagged. Only passes on a
  // direct location match; otherwise hidden by default, not shown
  // flagged-as-uncertain (confirmed tradeoff: a wasted Claude call + a
  // cluttered queue costs more than an invisible miss).
  return matchesLocation
    ? { passes: true, reason: "location-match" }
    : { passes: false, reason: "no-signal-location-mismatch" };
}
