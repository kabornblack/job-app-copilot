export interface ProfileInput {
  skills: string[];
  targetRoles: string[];
  locations: string[];
  remotePref: "remote" | "hybrid" | "onsite" | "any" | string | null;
  resumeSummary?: string | null;
}

export interface JobInput {
  title?: string | null;
  description?: string | null;
  company?: string | null;
  location?: string | null;
  remoteType?: string | null;
}

const normalize = (value: string | null | undefined) =>
  value?.toLowerCase().trim() ?? "";

const joinText = (...values: Array<string | null | undefined>) =>
  values.map(normalize).filter(Boolean).join(" ");

export function scoreProfileJob(profile: ProfileInput, job: JobInput) {
  const jobText = joinText(
    job.title,
    job.description,
    job.company,
    job.location,
    job.remoteType,
  );

  const skillMatches = profile.skills
    .map(normalize)
    .filter((skill) => skill && jobText.includes(skill)).length;

  const roleMatches = profile.targetRoles
    .map(normalize)
    .filter((role) => role && jobText.includes(role)).length;

  const locationMatches = profile.locations.some((location) => {
    const normalizedLocation = normalize(location);
    return normalizedLocation && jobText.includes(normalizedLocation);
  })
    ? 1
    : 0;

  const remotePref = profile.remotePref ?? "any";
  const remoteMatch =
    remotePref === "any" ||
    normalize(job.remoteType).includes(normalize(remotePref))
      ? 1
      : 0;

  const rawScore = Math.min(
    10,
    skillMatches * 2 + roleMatches + locationMatches + remoteMatch,
  );

  const score = Number(Math.max(1, rawScore).toFixed(1));

  const explanationParts: string[] = [];
  if (skillMatches > 0) {
    explanationParts.push(
      `${skillMatches} skill${skillMatches === 1 ? "" : "s"} matched`,
    );
  } else {
    explanationParts.push("No skills matched");
  }
  if (roleMatches > 0) {
    explanationParts.push(
      `${roleMatches} role keyword${roleMatches === 1 ? "" : "s"} matched`,
    );
  }
  if (locationMatches) {
    explanationParts.push("Location looks relevant");
  }
  if (remoteMatch) {
    explanationParts.push("Remote preference fits");
  }

  return {
    score,
    explanation: explanationParts.join("; "),
  };
}
