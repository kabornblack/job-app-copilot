import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createAchievement,
  createCertification,
  createEducation,
  createSkill,
  createWorkExperience,
  deleteAchievement,
  deleteCertification,
  deleteEducation,
  deletePersonalDetails,
  deleteSkill,
  deleteWorkExperience,
  getPersonalDetails,
  listAchievements,
  listCertifications,
  listEducation,
  listSkills,
  listWorkExperience,
  updateAchievement,
  updateCertification,
  updateEducation,
  updateSkill,
  updateWorkExperience,
  upsertPersonalDetails,
} from "../lib/profile-knowledge";

const idParamSchema = z.object({ id: z.string().uuid() });

const monthSchema = z.number().int().min(1).max(12);
const yearSchema = z.number().int().min(1900).max(2100);

const personalDetailsBodySchema = z.object({
  fullName: z.string().trim().min(1).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  linkedinUrl: z.string().trim().optional().nullable(),
  portfolioUrl: z.string().trim().optional().nullable(),
  professionalSummary: z.string().optional().nullable(),
});

const workExperienceCreateSchema = z
  .object({
    company: z.string().trim().min(1),
    title: z.string().trim().min(1),
    location: z.string().trim().optional().nullable(),
    startMonth: monthSchema,
    startYear: yearSchema,
    endMonth: monthSchema.optional().nullable(),
    endYear: yearSchema.optional().nullable(),
    bullets: z.array(z.string()).optional(),
  })
  .refine((v) => (v.endMonth == null) === (v.endYear == null), {
    message: "endMonth and endYear must both be set or both be omitted",
  });

// No cross-field refine here (unlike the create schema): a partial update
// can touch just endMonth or just endYear without knowing the existing row's
// other value, so the both-or-neither pairing can't be validated correctly
// at this layer. The DB CHECK constraint is the source of truth for updates.
const workExperienceUpdateSchema = z.object({
  company: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  location: z.string().trim().optional().nullable(),
  startMonth: monthSchema.optional(),
  startYear: yearSchema.optional(),
  endMonth: monthSchema.optional().nullable(),
  endYear: yearSchema.optional().nullable(),
  bullets: z.array(z.string()).optional(),
});

const educationCreateSchema = z
  .object({
    institution: z.string().trim().min(1),
    degree: z.string().trim().min(1),
    fieldOfStudy: z.string().trim().optional().nullable(),
    startMonth: monthSchema,
    startYear: yearSchema,
    endMonth: monthSchema.optional().nullable(),
    endYear: yearSchema.optional().nullable(),
    description: z.string().optional().nullable(),
  })
  .refine((v) => (v.endMonth == null) === (v.endYear == null), {
    message: "endMonth and endYear must both be set or both be omitted",
  });

const educationUpdateSchema = z.object({
  institution: z.string().trim().min(1).optional(),
  degree: z.string().trim().min(1).optional(),
  fieldOfStudy: z.string().trim().optional().nullable(),
  startMonth: monthSchema.optional(),
  startYear: yearSchema.optional(),
  endMonth: monthSchema.optional().nullable(),
  endYear: yearSchema.optional().nullable(),
  description: z.string().optional().nullable(),
});

const certificationCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    issuer: z.string().trim().min(1),
    issueMonth: monthSchema.optional().nullable(),
    issueYear: yearSchema.optional().nullable(),
    expirationMonth: monthSchema.optional().nullable(),
    expirationYear: yearSchema.optional().nullable(),
    credentialId: z.string().trim().optional().nullable(),
    credentialUrl: z.string().trim().optional().nullable(),
  })
  .refine((v) => (v.issueMonth == null) === (v.issueYear == null), {
    message: "issueMonth and issueYear must both be set or both be omitted",
  })
  .refine(
    (v) => (v.expirationMonth == null) === (v.expirationYear == null),
    {
      message:
        "expirationMonth and expirationYear must both be set or both be omitted",
    },
  );

const certificationUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  issuer: z.string().trim().min(1).optional(),
  issueMonth: monthSchema.optional().nullable(),
  issueYear: yearSchema.optional().nullable(),
  expirationMonth: monthSchema.optional().nullable(),
  expirationYear: yearSchema.optional().nullable(),
  credentialId: z.string().trim().optional().nullable(),
  credentialUrl: z.string().trim().optional().nullable(),
});

const achievementCreateSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional().nullable(),
    month: monthSchema.optional().nullable(),
    year: yearSchema.optional().nullable(),
  })
  .refine((v) => (v.month == null) === (v.year == null), {
    message: "month and year must both be set or both be omitted",
  });

const achievementUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  month: monthSchema.optional().nullable(),
  year: yearSchema.optional().nullable(),
});

const skillCreateSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().optional().nullable(),
});

const skillUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.string().trim().optional().nullable(),
});

/**
 * Phase 7 / ADR-0004: profile knowledge base CRUD routes. Registered as a
 * Fastify plugin from index.ts — auth is inherited from the global
 * requireSupabaseAuth onRequest hook on the parent server instance (Fastify
 * hooks flow parent -> child registration), so every handler below can rely
 * on request.user already being set for any request that reached it.
 */
export default async function profileKnowledgeRoutes(
  fastify: FastifyInstance,
) {
  // --- personal_details (1:1) ---

  fastify.get("/profile/personal-details", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const row = await getPersonalDetails(userId);
    return row ?? {};
  });

  fastify.put("/profile/personal-details", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = personalDetailsBodySchema.parse(request.body);
    const row = await upsertPersonalDetails(userId, body);
    return row;
  });

  fastify.delete("/profile/personal-details", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const row = await deletePersonalDetails(userId);
    if (!row) {
      return reply.status(404).send({ error: "Personal details not found" });
    }
    return row;
  });

  // --- work_experience (1:many) ---

  fastify.get("/profile/work-experience", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { items: await listWorkExperience(userId) };
  });

  fastify.post("/profile/work-experience", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = workExperienceCreateSchema.parse(request.body);
    const row = await createWorkExperience(userId, body);
    return reply.status(201).send(row);
  });

  fastify.patch("/profile/work-experience/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const body = workExperienceUpdateSchema.parse(request.body);
    const row = await updateWorkExperience(userId, id, body);
    if (!row) {
      return reply.status(404).send({ error: "Work experience not found" });
    }
    return row;
  });

  fastify.delete("/profile/work-experience/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const row = await deleteWorkExperience(userId, id);
    if (!row) {
      return reply.status(404).send({ error: "Work experience not found" });
    }
    return row;
  });

  // --- education (1:many) ---

  fastify.get("/profile/education", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { items: await listEducation(userId) };
  });

  fastify.post("/profile/education", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = educationCreateSchema.parse(request.body);
    const row = await createEducation(userId, body);
    return reply.status(201).send(row);
  });

  fastify.patch("/profile/education/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const body = educationUpdateSchema.parse(request.body);
    const row = await updateEducation(userId, id, body);
    if (!row) {
      return reply.status(404).send({ error: "Education not found" });
    }
    return row;
  });

  fastify.delete("/profile/education/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const row = await deleteEducation(userId, id);
    if (!row) {
      return reply.status(404).send({ error: "Education not found" });
    }
    return row;
  });

  // --- certifications (1:many) ---

  fastify.get("/profile/certifications", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { items: await listCertifications(userId) };
  });

  fastify.post("/profile/certifications", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = certificationCreateSchema.parse(request.body);
    const row = await createCertification(userId, body);
    return reply.status(201).send(row);
  });

  fastify.patch("/profile/certifications/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const body = certificationUpdateSchema.parse(request.body);
    const row = await updateCertification(userId, id, body);
    if (!row) {
      return reply.status(404).send({ error: "Certification not found" });
    }
    return row;
  });

  fastify.delete("/profile/certifications/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const row = await deleteCertification(userId, id);
    if (!row) {
      return reply.status(404).send({ error: "Certification not found" });
    }
    return row;
  });

  // --- achievements (1:many) ---

  fastify.get("/profile/achievements", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { items: await listAchievements(userId) };
  });

  fastify.post("/profile/achievements", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = achievementCreateSchema.parse(request.body);
    const row = await createAchievement(userId, body);
    return reply.status(201).send(row);
  });

  fastify.patch("/profile/achievements/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const body = achievementUpdateSchema.parse(request.body);
    const row = await updateAchievement(userId, id, body);
    if (!row) {
      return reply.status(404).send({ error: "Achievement not found" });
    }
    return row;
  });

  fastify.delete("/profile/achievements/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const row = await deleteAchievement(userId, id);
    if (!row) {
      return reply.status(404).send({ error: "Achievement not found" });
    }
    return row;
  });

  // --- skills (1:many — CV-display, separate from profiles.skills matching) ---

  fastify.get("/profile/skills", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { items: await listSkills(userId) };
  });

  fastify.post("/profile/skills", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const body = skillCreateSchema.parse(request.body);
    const row = await createSkill(userId, body);
    return reply.status(201).send(row);
  });

  fastify.patch("/profile/skills/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const body = skillUpdateSchema.parse(request.body);
    const row = await updateSkill(userId, id, body);
    if (!row) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return row;
  });

  fastify.delete("/profile/skills/:id", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id } = idParamSchema.parse(request.params);
    const row = await deleteSkill(userId, id);
    if (!row) {
      return reply.status(404).send({ error: "Skill not found" });
    }
    return row;
  });
}
