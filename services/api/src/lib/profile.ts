export type ProfileFields = {
  skills: string[];
  targetRoles: string[];
  locations: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  remotePref?: string | null;
  resumeSummary?: string | null;
};

const normalizeList = (values: string[] | null | undefined) =>
  [...(values ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();

const normalizeOptionalString = (value: string | null | undefined) =>
  (value ?? "").trim();

export function profileDataEquals(
  existing: ProfileFields,
  incoming: ProfileFields,
): boolean {
  return (
    JSON.stringify(normalizeList(existing.skills)) ===
      JSON.stringify(normalizeList(incoming.skills)) &&
    JSON.stringify(normalizeList(existing.targetRoles)) ===
      JSON.stringify(normalizeList(incoming.targetRoles)) &&
    JSON.stringify(normalizeList(existing.locations)) ===
      JSON.stringify(normalizeList(incoming.locations)) &&
    (existing.salaryMin ?? null) === (incoming.salaryMin ?? null) &&
    (existing.salaryMax ?? null) === (incoming.salaryMax ?? null) &&
    (existing.currency ?? "EUR") === (incoming.currency ?? "EUR") &&
    (existing.remotePref ?? "any") === (incoming.remotePref ?? "any") &&
    normalizeOptionalString(existing.resumeSummary) ===
      normalizeOptionalString(incoming.resumeSummary)
  );
}
