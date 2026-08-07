import Fastify from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db/client";
import {
  applications,
  generatedDocuments,
  jobs,
  matches,
  profiles,
} from "./db/schema";
import { searchAdzuna, type AdzunaJob } from "./lib/adzuna";
import { scoreProfileJob } from "./lib/score";
import { generateClaudeText } from "./lib/claude";

const server = Fastify({ logger: true });

server.addHook("onRequest", async (request, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  reply.header("access-control-allow-headers", "Content-Type,Authorization");
  if (request.method === "OPTIONS") {
    await reply.status(204).send();
  }
});

server.get("/health", async () => ({ status: "ok" }));

const profileSchema = z.object({
  skills: z.array(z.string()).min(1),
  targetRoles: z.array(z.string()).optional().default([]),
  locations: z.array(z.string()).optional().default([]),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  currency: z.string().optional().default("EUR"),
  remotePref: z
    .enum(["remote", "hybrid", "onsite", "any"])
    .optional()
    .default("any"),
  resumeSummary: z.string().optional(),
});

const searchBodySchema = z.object({
  profile: profileSchema,
});

const generateBodySchema = z.object({
  type: z.enum(["cv", "cover_letter"]),
});

const statusSchema = z.object({
  status: z.enum([
    "found",
    "reviewing",
    "tailored",
    "applied",
    "interviewing",
    "offer",
    "rejected",
    "withdrawn",
  ]),
});

server.post("/jobs/search", async (request, reply) => {
  const body = searchBodySchema.parse(request.body);

  const [profile] = await db
    .insert(profiles)
    .values({
      skills: body.profile.skills,
      targetRoles: body.profile.targetRoles,
      locations: body.profile.locations,
      salaryMin: body.profile.salaryMin,
      salaryMax: body.profile.salaryMax,
      currency: body.profile.currency,
      remotePref: body.profile.remotePref,
      resumeSummary: body.profile.resumeSummary,
    })
    .returning();

  if (!profile) {
    return reply.status(500).send({ error: "Failed to create profile" });
  }

  const adzunaResult = await searchAdzuna(profile);
  const adzunaJobs = adzunaResult.jobs;
  const results: Array<{
    jobId: string;
    score: number;
    explanation: string;
    status: string;
  }> = [];

  for (const adzunaJob of adzunaJobs) {
    let job = (
      await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.source, adzunaJob.source),
            eq(jobs.externalId, adzunaJob.externalId),
          ),
        )
        .limit(1)
    )[0];

    if (!job) {
      const [inserted] = await db
        .insert(jobs)
        .values({
          ...adzunaJob,
          postedAt: adzunaJob.postedAt ? new Date(adzunaJob.postedAt) : null,
          salaryMin:
            adzunaJob.salaryMin !== null && adzunaJob.salaryMin !== undefined
              ? Math.round(adzunaJob.salaryMin)
              : null,
          salaryMax:
            adzunaJob.salaryMax !== null && adzunaJob.salaryMax !== undefined
              ? Math.round(adzunaJob.salaryMax)
              : null,
        })
        .returning();
      job = inserted;
    }

    const { score, explanation } = scoreProfileJob(profile, job as AdzunaJob);

    let match = (
      await db
        .select()
        .from(matches)
        .where(
          and(eq(matches.jobId, job.id), eq(matches.profileId, profile.id)),
        )
        .limit(1)
    )[0];

    if (!match) {
      const [insertedMatch] = await db
        .insert(matches)
        .values({
          jobId: job.id,
          profileId: profile.id,
          score: score.toFixed(1),
          explanation,
          modelVersion: "rule-based-v1",
        })
        .returning();
      match = insertedMatch;
    }

    const existingApplication = (
      await db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.jobId, job.id),
            eq(applications.matchId, match.id),
          ),
        )
        .limit(1)
    )[0];

    if (!existingApplication) {
      await db.insert(applications).values({
        jobId: job.id,
        matchId: match.id,
        status: "found",
      });
    }

    results.push({
      jobId: job.id,
      score,
      explanation,
      status: "found",
    });
  }

  return {
    profileId: profile.id,
    results,
    adzunaDebug: {
      requestUrl: adzunaResult.redactedUrl,
      rawResponse: adzunaResult.rawResponseText,
    },
  };
});

const generateForApplication = async (
  applicationId: string,
  type: "cv" | "cover_letter",
) => {
  const row = (
    await db
      .select({
        applicationId: applications.id,
        jobTitle: jobs.title,
        company: jobs.company,
        location: jobs.location,
        remoteType: jobs.remoteType,
        description: jobs.description,
        url: jobs.url,
        postedAt: jobs.postedAt,
        profileSkills: profiles.skills,
        profileTargetRoles: profiles.targetRoles,
        profileLocations: profiles.locations,
        profileRemotePref: profiles.remotePref,
        profileResumeSummary: profiles.resumeSummary,
      })
      .from(applications)
      .innerJoin(matches, eq(matches.id, applications.matchId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(profiles, eq(profiles.id, matches.profileId))
      .where(eq(applications.id, applicationId))
      .limit(1)
  )[0];

  if (!row) {
    return null;
  }

  const content = await generateClaudeText(
    {
      title: row.jobTitle,
      company: row.company,
      location: row.location,
      remoteType: row.remoteType,
      description: row.description,
      url: row.url,
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    },
    {
      skills: row.profileSkills,
      targetRoles: row.profileTargetRoles,
      locations: row.profileLocations,
      remotePref: row.profileRemotePref ?? "any",
      resumeSummary: row.profileResumeSummary ?? undefined,
    },
    type,
  );

  const existingDocument = (
    await db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.applicationId, row.applicationId),
          eq(generatedDocuments.docType, type),
        ),
      )
      .limit(1)
  )[0];

  let generated;

  if (existingDocument) {
    const [updated] = await db
      .update(generatedDocuments)
      .set({
        content,
        promptVersion: "phase1-v1",
        generatedAt: new Date(),
      })
      .where(eq(generatedDocuments.id, existingDocument.id))
      .returning();
    generated = updated;
  } else {
    const [inserted] = await db
      .insert(generatedDocuments)
      .values({
        applicationId: row.applicationId,
        docType: type,
        content,
        filePath: null,
        promptVersion: "phase1-v1",
      })
      .returning();
    generated = inserted;
  }

  await db
    .update(applications)
    .set(
      type === "cv"
        ? { cvDocumentId: generated.id }
        : { coverLetterDocumentId: generated.id },
    )
    .where(eq(applications.id, row.applicationId));

  return generated;
};

server.post("/applications/:applicationId/generate", async (request, reply) => {
  const { applicationId } = z
    .object({ applicationId: z.string().uuid() })
    .parse(request.params);
  const { type } = generateBodySchema.parse(request.body);

  const generated = await generateForApplication(applicationId, type);

  if (!generated) {
    return reply.status(404).send({ error: "Application or job not found" });
  }

  return generated;
});

server.post("/jobs/:jobId/generate", async (request, reply) => {
  const { jobId } = z
    .object({ jobId: z.string().uuid() })
    .parse(request.params);
  const { type } = generateBodySchema.parse(request.body);

  const application = (
    await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, jobId))
      .limit(1)
  )[0];

  if (!application) {
    return reply.status(404).send({ error: "Application not found" });
  }

  const generated = await generateForApplication(application.id, type);

  if (!generated) {
    return reply.status(404).send({ error: "Application or job not found" });
  }

  return generated;
});

server.get("/applications/review-queue", async (_request, _reply) => {
  const cvDocuments = alias(generatedDocuments, "cv_documents");
  const coverLetterDocuments = alias(
    generatedDocuments,
    "cover_letter_documents",
  );

  const queue = await db
    .select({
      applicationId: applications.id,
      status: applications.status,
      jobId: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      remoteType: jobs.remoteType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      url: jobs.url,
      score: matches.score,
      explanation: matches.explanation,
      generatedCV: cvDocuments.content,
      generatedCoverLetter: coverLetterDocuments.content,
    })
    .from(applications)
    .innerJoin(matches, eq(matches.id, applications.matchId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(
      cvDocuments,
      and(
        eq(cvDocuments.applicationId, applications.id),
        eq(cvDocuments.docType, "cv"),
      ),
    )
    .leftJoin(
      coverLetterDocuments,
      and(
        eq(coverLetterDocuments.applicationId, applications.id),
        eq(coverLetterDocuments.docType, "cover_letter"),
      ),
    )
    .orderBy(desc(applications.createdAt));

  const normalizedQueue = queue.map((item) => ({
    ...item,
    score: Number(item.score),
  }));

  return { queue: normalizedQueue };
});

server.patch("/applications/:applicationId/status", async (request, reply) => {
  const params = z
    .object({ applicationId: z.string().uuid() })
    .parse(request.params);
  const { status } = statusSchema.parse(request.body);

  const [updated] = await db
    .update(applications)
    .set({ status })
    .where(eq(applications.id, params.applicationId))
    .returning();

  if (!updated) {
    return reply.status(404).send({ error: "Application not found" });
  }

  return updated;
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();
