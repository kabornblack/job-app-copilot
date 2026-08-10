import Fastify from "fastify";
import { createReadStream } from "fs";
import { access } from "fs/promises";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireSupabaseAuth } from "./lib/auth";
import { initSentry, captureException, flushSentry } from "./lib/sentry";
import { db } from "./db/client";
import {
  applicationStatusHistory,
  applications,
  generatedDocuments,
  jobs,
  matches,
  profiles,
  searchRuns,
} from "./db/schema";
import { generateClaudeText } from "./lib/claude";
import {
  absoluteDocumentPath,
  plainTextToTipTapJson,
  tipTapJsonToPlainText,
  writeGeneratedDocumentsFromJson,
  type DocumentFormat,
  type TipTapDoc,
} from "./lib/documents";
import { resolveActiveProfile } from "./lib/resolve-profile";
import { emptySearchRunStats } from "./lib/search-runs";
import { registerBullBoard } from "./queue/bull-board";
import { getPipelineQueue } from "./queue/queues";

initSentry("api");

const server = Fastify({ logger: true, trustProxy: false });

server.addHook("onRequest", async (request, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  reply.header("access-control-allow-headers", "Content-Type,Authorization");
  if (request.method === "OPTIONS") {
    await reply.status(204).send();
  }
});

server.addHook("onRequest", requireSupabaseAuth);

server.get("/health", async () => ({ status: "ok" }));

if ((process.env.SENTRY_ENVIRONMENT ?? "development") === "development") {
  server.get("/debug/sentry-test", async () => {
    throw new Error(
      "Sentry proof: deliberate API error from /debug/sentry-test",
    );
  });
}

server.setErrorHandler(async (error, request, reply) => {
  const statusCode =
    typeof error.statusCode === "number" ? error.statusCode : 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (!isClientError) {
    const eventId = captureException(error, {
      tags: {
        route: request.url,
        method: request.method,
      },
      extra: {
        statusCode,
      },
    });
    await flushSentry();
    request.log.error({ err: error, sentryEventId: eventId }, "request failed");
  }

  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: error.flatten() });
  }

  return reply.status(statusCode).send({
    error: isClientError ? error.message : "Internal Server Error",
  });
});

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

const saveDocumentBodySchema = z.object({
  contentJson: z.object({
    type: z.literal("doc"),
    content: z.array(z.record(z.any())).optional(),
  }),
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

  try {
    const { profile, profileReused } = await resolveActiveProfile(
      body.profile,
    );

    const [run] = await db
      .insert(searchRuns)
      .values({
        profileId: profile.id,
        trigger: "manual",
        status: "queued",
        stats: emptySearchRunStats(profileReused),
      })
      .returning();

    if (!run) {
      return reply.status(500).send({ error: "Failed to create search run" });
    }

    await getPipelineQueue().add(
      "search-run",
      { runId: run.id, profileId: profile.id },
      {
        jobId: `search-run-${run.id}`,
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    return reply.status(202).send({
      runId: run.id,
      profileId: profile.id,
      profileReused,
      status: run.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start job search";
    if (message === "Failed to create profile") {
      return reply.status(500).send({ error: message });
    }
    throw error;
  }
});

server.get("/search-runs/:id", async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const [run] = await db
    .select()
    .from(searchRuns)
    .where(eq(searchRuns.id, params.id))
    .limit(1);

  if (!run) {
    return reply.status(404).send({ error: "Search run not found" });
  }

  return {
    id: run.id,
    profileId: run.profileId,
    trigger: run.trigger,
    status: run.status,
    stats: run.stats,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
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

  const contentJson = plainTextToTipTapJson(content);

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
        contentJson,
        filePath: null,
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
        contentJson,
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

server.patch(
  "/applications/:applicationId/documents/:docType",
  async (request, reply) => {
    const params = z
      .object({
        applicationId: z.string().uuid(),
        docType: z.enum(["cv", "cover_letter"]),
      })
      .parse(request.params);
    const body = saveDocumentBodySchema.parse(request.body);
    const contentJson = body.contentJson as TipTapDoc;
    const content = tipTapJsonToPlainText(contentJson);

    const [existing] = await db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.applicationId, params.applicationId),
          eq(generatedDocuments.docType, params.docType),
        ),
      )
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Document not found" });
    }

    const [updated] = await db
      .update(generatedDocuments)
      .set({
        content,
        contentJson,
        filePath: null,
        generatedAt: new Date(),
      })
      .where(eq(generatedDocuments.id, existing.id))
      .returning();

    return updated;
  },
);

server.get(
  "/applications/:applicationId/documents/:docType/download",
  async (request, reply) => {
    const params = z
      .object({
        applicationId: z.string().uuid(),
        docType: z.enum(["cv", "cover_letter"]),
      })
      .parse(request.params);
    const query = z
      .object({ format: z.enum(["docx", "pdf"]).default("docx") })
      .parse(request.query);

    const [document] = await db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.applicationId, params.applicationId),
          eq(generatedDocuments.docType, params.docType),
        ),
      )
      .limit(1);

    if (!document?.contentJson) {
      return reply
        .status(404)
        .send({ error: "Saved document content not found" });
    }

    const { stem } = await writeGeneratedDocumentsFromJson({
      applicationId: params.applicationId,
      docType: params.docType,
      contentJson: document.contentJson as TipTapDoc,
    });

    await db
      .update(generatedDocuments)
      .set({ filePath: stem })
      .where(eq(generatedDocuments.id, document.id));

    const absolutePath = absoluteDocumentPath(
      stem,
      query.format as DocumentFormat,
    );

    try {
      await access(absolutePath);
    } catch {
      return reply
        .status(404)
        .send({ error: "Document file missing on disk" });
    }

    const filename = `${params.docType}.${query.format}`;
    reply.header(
      "content-disposition",
      `attachment; filename="${filename}"`,
    );
    reply.type(
      query.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    return reply.send(createReadStream(absolutePath));
  },
);

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
      generatedCVJson: cvDocuments.contentJson,
      generatedCoverLetterJson: coverLetterDocuments.contentJson,
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

  const [existing] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);

  if (!existing) {
    return reply.status(404).send({ error: "Application not found" });
  }

  const now = new Date();
  const [updated] = await db
    .update(applications)
    .set({
      status,
      updatedAt: now,
      ...(status === "applied" && !existing.appliedAt
        ? { appliedAt: now }
        : {}),
    })
    .where(eq(applications.id, params.applicationId))
    .returning();

  if (!updated) {
    return reply.status(404).send({ error: "Application not found" });
  }

  if (existing.status !== status) {
    await db.insert(applicationStatusHistory).values({
      applicationId: params.applicationId,
      status,
      changedAt: now,
    });
  }

  return updated;
});

const start = async () => {
  try {
    await registerBullBoard(server);
    await server.listen({ port: 3001, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();
