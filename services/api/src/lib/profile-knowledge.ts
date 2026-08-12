import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  achievements,
  certifications,
  education,
  personalDetails,
  skills,
  workExperience,
} from "../db/schema";

/**
 * Phase 7 / ADR-0004: profile knowledge base CRUD, all scoped by user_id.
 * Plain functions (not route handlers) so they're directly testable against
 * the real local Postgres, same shape as job-search.ts's scoreMatchForJob —
 * routes/profile-knowledge.ts is a thin Fastify wrapper around these.
 */

// ---------------------------------------------------------------------------
// personal_details (1:1 — user_id is the primary key)
// ---------------------------------------------------------------------------

export type PersonalDetailsInput = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  professionalSummary?: string | null;
};

export async function getPersonalDetails(userId: string) {
  const [row] = await db
    .select()
    .from(personalDetails)
    .where(eq(personalDetails.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertPersonalDetails(
  userId: string,
  input: PersonalDetailsInput,
) {
  const [row] = await db
    .insert(personalDetails)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: personalDetails.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function deletePersonalDetails(userId: string) {
  const [row] = await db
    .delete(personalDetails)
    .where(eq(personalDetails.userId, userId))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// work_experience (1:many)
// ---------------------------------------------------------------------------

export type WorkExperienceInput = {
  company: string;
  title: string;
  location?: string | null;
  startMonth: number;
  startYear: number;
  endMonth?: number | null;
  endYear?: number | null;
  bullets?: string[];
};

export type WorkExperienceUpdateInput = Partial<WorkExperienceInput>;

export async function listWorkExperience(userId: string) {
  return db
    .select()
    .from(workExperience)
    .where(eq(workExperience.userId, userId))
    .orderBy(workExperience.startYear, workExperience.startMonth);
}

export async function createWorkExperience(
  userId: string,
  input: WorkExperienceInput,
) {
  const [row] = await db
    .insert(workExperience)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function updateWorkExperience(
  userId: string,
  id: string,
  input: WorkExperienceUpdateInput,
) {
  const [row] = await db
    .update(workExperience)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(workExperience.id, id), eq(workExperience.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteWorkExperience(userId: string, id: string) {
  const [row] = await db
    .delete(workExperience)
    .where(and(eq(workExperience.id, id), eq(workExperience.userId, userId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// education (1:many)
// ---------------------------------------------------------------------------

export type EducationInput = {
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startMonth: number;
  startYear: number;
  endMonth?: number | null;
  endYear?: number | null;
  description?: string | null;
};

export type EducationUpdateInput = Partial<EducationInput>;

export async function listEducation(userId: string) {
  return db
    .select()
    .from(education)
    .where(eq(education.userId, userId))
    .orderBy(education.startYear, education.startMonth);
}

export async function createEducation(userId: string, input: EducationInput) {
  const [row] = await db
    .insert(education)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function updateEducation(
  userId: string,
  id: string,
  input: EducationUpdateInput,
) {
  const [row] = await db
    .update(education)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(education.id, id), eq(education.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteEducation(userId: string, id: string) {
  const [row] = await db
    .delete(education)
    .where(and(eq(education.id, id), eq(education.userId, userId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// certifications (1:many)
// ---------------------------------------------------------------------------

export type CertificationInput = {
  name: string;
  issuer: string;
  issueMonth?: number | null;
  issueYear?: number | null;
  expirationMonth?: number | null;
  expirationYear?: number | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
};

export type CertificationUpdateInput = Partial<CertificationInput>;

export async function listCertifications(userId: string) {
  return db
    .select()
    .from(certifications)
    .where(eq(certifications.userId, userId))
    .orderBy(certifications.issueYear, certifications.issueMonth);
}

export async function createCertification(
  userId: string,
  input: CertificationInput,
) {
  const [row] = await db
    .insert(certifications)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function updateCertification(
  userId: string,
  id: string,
  input: CertificationUpdateInput,
) {
  const [row] = await db
    .update(certifications)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(certifications.id, id), eq(certifications.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteCertification(userId: string, id: string) {
  const [row] = await db
    .delete(certifications)
    .where(and(eq(certifications.id, id), eq(certifications.userId, userId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// achievements (1:many)
// ---------------------------------------------------------------------------

export type AchievementInput = {
  title: string;
  description?: string | null;
  month?: number | null;
  year?: number | null;
};

export type AchievementUpdateInput = Partial<AchievementInput>;

export async function listAchievements(userId: string) {
  return db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(achievements.year, achievements.month);
}

export async function createAchievement(
  userId: string,
  input: AchievementInput,
) {
  const [row] = await db
    .insert(achievements)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function updateAchievement(
  userId: string,
  id: string,
  input: AchievementUpdateInput,
) {
  const [row] = await db
    .update(achievements)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(achievements.id, id), eq(achievements.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteAchievement(userId: string, id: string) {
  const [row] = await db
    .delete(achievements)
    .where(and(eq(achievements.id, id), eq(achievements.userId, userId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// skills (1:many — CV-display only, separate from profiles.skills matching)
// ---------------------------------------------------------------------------

export type SkillInput = {
  name: string;
  category?: string | null;
};

export type SkillUpdateInput = Partial<SkillInput>;

/**
 * Thrown when an insert/update on `skills` would violate its
 * skills_user_id_name_unique constraint. Kept in the same "custom error
 * class + type guard" shape as quota.ts's QuotaExceededError so the global
 * Fastify error handler in index.ts can turn it into a clean 400 instead of
 * leaking the raw Postgres 23505 error as a 500.
 */
export class DuplicateSkillError extends Error {
  constructor(name: string) {
    super(`You already have a skill named "${name}".`);
    this.name = "DuplicateSkillError";
  }
}

export function isDuplicateSkillError(
  error: unknown,
): error is DuplicateSkillError {
  return error instanceof DuplicateSkillError;
}

// Postgres unique_violation. node-postgres surfaces this as a plain object
// with a `code` string, not a typed class, so a structural check is needed.
function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export async function listSkills(userId: string) {
  return db.select().from(skills).where(eq(skills.userId, userId)).orderBy(skills.name);
}

export async function createSkill(userId: string, input: SkillInput) {
  try {
    const [row] = await db
      .insert(skills)
      .values({ userId, ...input })
      .returning();
    return row;
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new DuplicateSkillError(input.name);
    }
    throw error;
  }
}

export async function updateSkill(
  userId: string,
  id: string,
  input: SkillUpdateInput,
) {
  try {
    const [row] = await db
      .update(skills)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning();
    return row ?? null;
  } catch (error) {
    if (isPgUniqueViolation(error) && input.name) {
      throw new DuplicateSkillError(input.name);
    }
    throw error;
  }
}

export async function deleteSkill(userId: string, id: string) {
  const [row] = await db
    .delete(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .returning();
  return row ?? null;
}
