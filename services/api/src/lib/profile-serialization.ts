import type {
  achievements,
  certifications,
  education,
  personalDetails,
  skills,
  workExperience,
} from "../db/schema";

/**
 * Phase 7 Stage 3 / ADR-0005: formats the six ADR-0004 profile-knowledge
 * resources into a single structured, human-readable text block for use in
 * generation prompts (services/api/src/lib/claude.ts).
 *
 * Used in BOTH generation paths - as the primary fact source when no CV is
 * uploaded, and as the gap-filling source (secondary to the uploaded CV's
 * text) when one is. Plain labeled sections rather than JSON, matching the
 * existing prompt's plain-bullet style (readable in logs, no schema to
 * explain to the model).
 */

type PersonalDetailsRow = typeof personalDetails.$inferSelect;
type WorkExperienceRow = typeof workExperience.$inferSelect;
type EducationRow = typeof education.$inferSelect;
type CertificationRow = typeof certifications.$inferSelect;
type AchievementRow = typeof achievements.$inferSelect;
type SkillRow = typeof skills.$inferSelect;

export type ProfileKnowledgeBundle = {
  personalDetails: PersonalDetailsRow | null;
  workExperience: WorkExperienceRow[];
  education: EducationRow[];
  certifications: CertificationRow[];
  achievements: AchievementRow[];
  skills: SkillRow[];
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthName(month: number | null): string {
  if (month === null || month < 1 || month > 12) return "";
  return MONTH_NAMES[month - 1];
}

function dateRange(
  startMonth: number,
  startYear: number,
  endMonth: number | null,
  endYear: number | null,
): string {
  const start = `${monthName(startMonth)} ${startYear}`;
  const end = endYear === null ? "Present" : `${monthName(endMonth)} ${endYear}`;
  return `${start} - ${end}`;
}

function optionalDate(month: number | null, year: number | null): string | null {
  if (year === null) return null;
  return month === null ? `${year}` : `${monthName(month)} ${year}`;
}

function serializePersonalInfo(row: PersonalDetailsRow | null): string {
  if (!row) return "";
  const lines: string[] = [];
  if (row.fullName) lines.push(`- Full name: ${row.fullName}`);
  if (row.email) lines.push(`- Email: ${row.email}`);
  if (row.phone) lines.push(`- Phone: ${row.phone}`);
  if (row.location) lines.push(`- Location: ${row.location}`);
  if (row.linkedinUrl) lines.push(`- LinkedIn: ${row.linkedinUrl}`);
  if (row.portfolioUrl) lines.push(`- Portfolio: ${row.portfolioUrl}`);
  if (lines.length === 0) return "";
  return `PERSONAL INFO:\n${lines.join("\n")}`;
}

// resumeSummary/professional_summary is intentionally NOT part of the
// PERSONAL INFO block above - per ADR-0005 it's demoted from fact source to
// framing/tone input only, so it gets its own clearly-labeled section
// callers can choose to omit or de-emphasize, rather than being folded in
// as if it were a verified fact like the contact details above.
function serializeFramingSummary(summary: string | null | undefined): string {
  if (!summary || !summary.trim()) return "";
  return `PROFESSIONAL SUMMARY (framing/tone only, not a fact source):\n${summary.trim()}`;
}

function serializeWorkExperience(rows: WorkExperienceRow[]): string {
  if (rows.length === 0) return "";
  // Most recent first: rows arrive startYear/startMonth ascending from
  // listWorkExperience, so reverse for the conventional CV order.
  const sorted = [...rows].reverse();
  const entries = sorted.map((row) => {
    const range = dateRange(row.startMonth, row.startYear, row.endMonth, row.endYear);
    const loc = row.location ? ` (${row.location})` : "";
    const header = `- ${row.title} at ${row.company}, ${range}${loc}`;
    const bullets = row.bullets.map((b) => `  - ${b}`).join("\n");
    return bullets ? `${header}\n${bullets}` : header;
  });
  return `WORK EXPERIENCE (most recent first):\n${entries.join("\n")}`;
}

function serializeEducation(rows: EducationRow[]): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].reverse();
  const entries = sorted.map((row) => {
    const range = dateRange(row.startMonth, row.startYear, row.endMonth, row.endYear);
    const field = row.fieldOfStudy ? ` (${row.fieldOfStudy})` : "";
    const header = `- ${row.degree}${field}, ${row.institution}, ${range}`;
    return row.description ? `${header}\n  ${row.description}` : header;
  });
  return `EDUCATION:\n${entries.join("\n")}`;
}

function serializeCertifications(rows: CertificationRow[]): string {
  if (rows.length === 0) return "";
  const entries = rows.map((row) => {
    const issued = optionalDate(row.issueMonth, row.issueYear);
    const expires = optionalDate(row.expirationMonth, row.expirationYear);
    const parts: string[] = [];
    if (issued) parts.push(`Issued ${issued}`);
    if (expires) parts.push(`Expires ${expires}`);
    const meta = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return `- ${row.name}, ${row.issuer}${meta}`;
  });
  return `CERTIFICATIONS:\n${entries.join("\n")}`;
}

function serializeAchievements(rows: AchievementRow[]): string {
  if (rows.length === 0) return "";
  const entries = rows.map((row) => {
    const date = optionalDate(row.month, row.year);
    const header = date ? `- ${row.title} (${date})` : `- ${row.title}`;
    return row.description ? `${header}: ${row.description}` : header;
  });
  return `ACHIEVEMENTS:\n${entries.join("\n")}`;
}

function serializeSkills(rows: SkillRow[]): string {
  if (rows.length === 0) return "";
  const byCategory = new Map<string, string[]>();
  const uncategorized: string[] = [];
  for (const row of rows) {
    if (row.category) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row.name);
      byCategory.set(row.category, list);
    } else {
      uncategorized.push(row.name);
    }
  }
  const lines: string[] = [];
  for (const [category, names] of byCategory) {
    lines.push(`- ${category}: ${names.join(", ")}`);
  }
  if (uncategorized.length > 0) {
    lines.push(`- ${uncategorized.join(", ")}`);
  }
  return `SKILLS:\n${lines.join("\n")}`;
}

/**
 * Serializes the six profile-knowledge resources into one structured text
 * block. `resumeSummary` comes in separately (not part of the bundle) since
 * it lives on `profiles`, not the ADR-0004 tables - see claude.ts.
 */
export function serializeProfileKnowledge(
  bundle: ProfileKnowledgeBundle,
  resumeSummary?: string | null,
): string {
  const sections = [
    serializePersonalInfo(bundle.personalDetails),
    serializeFramingSummary(resumeSummary),
    serializeWorkExperience(bundle.workExperience),
    serializeEducation(bundle.education),
    serializeCertifications(bundle.certifications),
    serializeAchievements(bundle.achievements),
    serializeSkills(bundle.skills),
  ].filter((section) => section.length > 0);

  if (sections.length === 0) {
    return "No structured profile data on file.";
  }
  return sections.join("\n\n");
}
