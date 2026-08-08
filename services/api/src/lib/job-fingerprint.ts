import crypto from "crypto";

/** Normalize title/company/location for cross-source fingerprinting. */
export function normalizeJobFingerprintPart(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Stable hash of normalized title+company+location.
 * Must not include source or externalId — those differ across boards.
 */
export function computeJobFingerprint(input: {
  title: string;
  company: string;
  location?: string | null;
}): string {
  const title = normalizeJobFingerprintPart(input.title);
  const company = normalizeJobFingerprintPart(input.company);
  const location = normalizeJobFingerprintPart(input.location);
  return crypto
    .createHash("sha256")
    .update(`${title}\0${company}\0${location}`)
    .digest("hex");
}
