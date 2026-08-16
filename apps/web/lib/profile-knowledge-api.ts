import { apiFetch } from "./api";
import { extractErrorMessage } from "./error-message";

/**
 * Typed client for the Phase 7 Stage 1 profile-knowledge CRUD API
 * (services/api/src/routes/profile-knowledge.ts). Field names/shapes mirror
 * that route file + services/api/src/db/schema.ts exactly — there's no
 * shared types package between services/api and apps/web in this monorepo,
 * so these are hand-kept in sync.
 */

async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(extractErrorMessage(rawBody, fallback));
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// personal_details (1:1)
// ---------------------------------------------------------------------------

export type PersonalDetails = {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  professionalSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonalDetailsInput = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  professionalSummary?: string | null;
};

export async function getPersonalDetails(): Promise<PersonalDetails | null> {
  const response = await apiFetch("/profile/personal-details");
  const data = await parseOrThrow<Partial<PersonalDetails>>(
    response,
    "Failed to load personal details",
  );
  return data.userId ? (data as PersonalDetails) : null;
}

export async function putPersonalDetails(
  input: PersonalDetailsInput,
): Promise<PersonalDetails> {
  const response = await apiFetch("/profile/personal-details", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return parseOrThrow<PersonalDetails>(response, "Failed to save personal details");
}

// ---------------------------------------------------------------------------
// work_experience (1:many)
// ---------------------------------------------------------------------------

export type WorkExperience = {
  id: string;
  userId: string;
  company: string;
  title: string;
  location: string | null;
  startMonth: number;
  startYear: number;
  endMonth: number | null;
  endYear: number | null;
  bullets: string[];
  createdAt: string;
  updatedAt: string;
};

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

export async function listWorkExperience(): Promise<WorkExperience[]> {
  const response = await apiFetch("/profile/work-experience");
  const data = await parseOrThrow<{ items: WorkExperience[] }>(
    response,
    "Failed to load work experience",
  );
  return data.items;
}

export async function createWorkExperience(
  input: WorkExperienceInput,
): Promise<WorkExperience> {
  const response = await apiFetch("/profile/work-experience", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseOrThrow<WorkExperience>(response, "Failed to create work experience");
}

export async function updateWorkExperience(
  id: string,
  input: Partial<WorkExperienceInput>,
): Promise<WorkExperience> {
  const response = await apiFetch(`/profile/work-experience/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseOrThrow<WorkExperience>(response, "Failed to update work experience");
}

export async function deleteWorkExperience(id: string): Promise<void> {
  const response = await apiFetch(`/profile/work-experience/${id}`, {
    method: "DELETE",
  });
  await parseOrThrow<WorkExperience>(response, "Failed to delete work experience");
}

// ---------------------------------------------------------------------------
// education (1:many)
// ---------------------------------------------------------------------------

export type Education = {
  id: string;
  userId: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startMonth: number;
  startYear: number;
  endMonth: number | null;
  endYear: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export async function listEducation(): Promise<Education[]> {
  const response = await apiFetch("/profile/education");
  const data = await parseOrThrow<{ items: Education[] }>(
    response,
    "Failed to load education",
  );
  return data.items;
}

export async function createEducation(input: EducationInput): Promise<Education> {
  const response = await apiFetch("/profile/education", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Education>(response, "Failed to create education");
}

export async function updateEducation(
  id: string,
  input: Partial<EducationInput>,
): Promise<Education> {
  const response = await apiFetch(`/profile/education/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Education>(response, "Failed to update education");
}

export async function deleteEducation(id: string): Promise<void> {
  const response = await apiFetch(`/profile/education/${id}`, {
    method: "DELETE",
  });
  await parseOrThrow<Education>(response, "Failed to delete education");
}

// ---------------------------------------------------------------------------
// certifications (1:many)
// ---------------------------------------------------------------------------

export type Certification = {
  id: string;
  userId: string;
  name: string;
  issuer: string;
  issueMonth: number | null;
  issueYear: number | null;
  expirationMonth: number | null;
  expirationYear: number | null;
  credentialId: string | null;
  credentialUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export async function listCertifications(): Promise<Certification[]> {
  const response = await apiFetch("/profile/certifications");
  const data = await parseOrThrow<{ items: Certification[] }>(
    response,
    "Failed to load certifications",
  );
  return data.items;
}

export async function createCertification(
  input: CertificationInput,
): Promise<Certification> {
  const response = await apiFetch("/profile/certifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Certification>(response, "Failed to create certification");
}

export async function updateCertification(
  id: string,
  input: Partial<CertificationInput>,
): Promise<Certification> {
  const response = await apiFetch(`/profile/certifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Certification>(response, "Failed to update certification");
}

export async function deleteCertification(id: string): Promise<void> {
  const response = await apiFetch(`/profile/certifications/${id}`, {
    method: "DELETE",
  });
  await parseOrThrow<Certification>(response, "Failed to delete certification");
}

// ---------------------------------------------------------------------------
// achievements (1:many)
// ---------------------------------------------------------------------------

export type Achievement = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  month: number | null;
  year: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AchievementInput = {
  title: string;
  description?: string | null;
  month?: number | null;
  year?: number | null;
};

export async function listAchievements(): Promise<Achievement[]> {
  const response = await apiFetch("/profile/achievements");
  const data = await parseOrThrow<{ items: Achievement[] }>(
    response,
    "Failed to load achievements",
  );
  return data.items;
}

export async function createAchievement(input: AchievementInput): Promise<Achievement> {
  const response = await apiFetch("/profile/achievements", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Achievement>(response, "Failed to create achievement");
}

export async function updateAchievement(
  id: string,
  input: Partial<AchievementInput>,
): Promise<Achievement> {
  const response = await apiFetch(`/profile/achievements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Achievement>(response, "Failed to update achievement");
}

export async function deleteAchievement(id: string): Promise<void> {
  const response = await apiFetch(`/profile/achievements/${id}`, {
    method: "DELETE",
  });
  await parseOrThrow<Achievement>(response, "Failed to delete achievement");
}

// ---------------------------------------------------------------------------
// skills (1:many — CV-display, separate from profiles.skills matching)
// ---------------------------------------------------------------------------

export type Skill = {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillInput = {
  name: string;
  category?: string | null;
};

export async function listSkills(): Promise<Skill[]> {
  const response = await apiFetch("/profile/skills");
  const data = await parseOrThrow<{ items: Skill[] }>(response, "Failed to load skills");
  return data.items;
}

export async function createSkill(input: SkillInput): Promise<Skill> {
  const response = await apiFetch("/profile/skills", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Skill>(response, "Failed to create skill");
}

export async function updateSkill(
  id: string,
  input: Partial<SkillInput>,
): Promise<Skill> {
  const response = await apiFetch(`/profile/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseOrThrow<Skill>(response, "Failed to update skill");
}

export async function deleteSkill(id: string): Promise<void> {
  const response = await apiFetch(`/profile/skills/${id}`, {
    method: "DELETE",
  });
  await parseOrThrow<Skill>(response, "Failed to delete skill");
}

// ---------------------------------------------------------------------------
// cv_uploads (1:1, optional — Phase 7 Stage 3 / ADR-0005)
// ---------------------------------------------------------------------------

export type CvUpload = {
  userId: string;
  filePath: string;
  originalFilename: string | null;
  extractedText: string;
  extractionStatus: "ok" | "empty" | "failed" | string;
  uploadedAt: string;
  updatedAt: string;
};

export async function getCvUpload(): Promise<CvUpload | null> {
  const response = await apiFetch("/profile/cv");
  const data = await parseOrThrow<CvUpload | null>(response, "Failed to load CV");
  return data && data.userId ? data : null;
}

export async function putCvUpload(file: File): Promise<CvUpload> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch("/profile/cv", {
    method: "PUT",
    body: formData,
  });
  return parseOrThrow<CvUpload>(response, "Failed to upload CV");
}

export async function deleteCvUpload(): Promise<void> {
  const response = await apiFetch("/profile/cv", { method: "DELETE" });
  await parseOrThrow<CvUpload>(response, "Failed to delete CV");
}
