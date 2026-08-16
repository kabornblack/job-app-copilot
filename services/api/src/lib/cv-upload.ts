import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { db } from "../db/client";
import { cvUploads } from "../db/schema";
import { apiRootDir } from "./documents";

/**
 * Phase 7 Stage 3 / ADR-0005: uploaded-CV storage + extraction. Plain
 * functions (not route handlers), same shape as profile-knowledge.ts -
 * routes/profile-knowledge.ts is a thin Fastify wrapper around these.
 *
 * Raw PDF bytes live on disk (same stem/absolute-path convention as
 * documents.ts's generated CV/cover-letter files); the extracted text - the
 * only part generation prompts actually read - lives in the cv_uploads row.
 */

export type ExtractionStatus = "ok" | "empty" | "failed";

export type CvUploadRow = {
  userId: string;
  filePath: string;
  originalFilename: string | null;
  extractedText: string;
  extractionStatus: string;
  uploadedAt: Date;
  updatedAt: Date;
};

/** Relative path stem for a user's CV - always a single fixed filename, so a
 * re-upload naturally replaces rather than accumulating files. */
export function cvUploadStem(userId: string): string {
  return `storage/uploads/${userId}/cv`;
}

export function absoluteCvPath(stem: string): string {
  return resolve(apiRootDir, `${stem}.pdf`);
}

/**
 * Extract plain text from a PDF buffer via pdf-parse v2's PDFParse class.
 * Never throws for a structurally valid-but-textless PDF (e.g. a scanned
 * image with no text layer) - reports "empty" instead, so the caller can
 * store that outcome rather than silently persisting an empty string as if
 * extraction succeeded normally. Throws only when the PDF itself can't be
 * parsed at all (corrupt file, not actually a PDF).
 *
 * pageJoiner is set explicitly to a plain blank line: pdf-parse v2's own
 * default (confirmed by reading ParseParameters.ts's
 * setDefaultParseParameters, not assumed) is
 * "\n-- page_number of total_number --", which otherwise gets silently
 * baked into every extracted CV's text - noise we don't want feeding into
 * the generation prompt.
 */
export async function extractPdfText(
  buffer: Buffer,
): Promise<{ text: string; status: ExtractionStatus }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "\n\n" });
    const text = result.text.trim();
    return { text, status: text.length > 0 ? "ok" : "empty" };
  } finally {
    await parser.destroy();
  }
}

export async function getCvUpload(userId: string): Promise<CvUploadRow | null> {
  const [row] = await db
    .select()
    .from(cvUploads)
    .where(eq(cvUploads.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Save (or replace) a user's uploaded CV: writes the raw PDF to disk,
 * extracts its text, and upserts the cv_uploads row. If extraction throws
 * (corrupt/unparseable PDF), the row is still written with
 * extractionStatus "failed" and empty extractedText - the upload is not
 * silently rejected, but generation will fall back to profile-only since
 * there's no usable CV text (see claude.ts / profile-serialization.ts).
 */
export async function saveCvUpload(
  userId: string,
  input: { buffer: Buffer; originalFilename: string | null },
): Promise<CvUploadRow> {
  const stem = cvUploadStem(userId);
  const absolutePath = absoluteCvPath(stem);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  let text = "";
  let status: ExtractionStatus = "failed";
  try {
    const extracted = await extractPdfText(input.buffer);
    text = extracted.text;
    status = extracted.status;
  } catch (error) {
    console.error("CV text extraction failed:", error);
  }

  const [row] = await db
    .insert(cvUploads)
    .values({
      userId,
      filePath: stem,
      originalFilename: input.originalFilename,
      extractedText: text,
      extractionStatus: status,
    })
    .onConflictDoUpdate({
      target: cvUploads.userId,
      set: {
        filePath: stem,
        originalFilename: input.originalFilename,
        extractedText: text,
        extractionStatus: status,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to save CV upload");
  }
  return row;
}

export async function deleteCvUpload(userId: string): Promise<CvUploadRow | null> {
  const [row] = await db
    .delete(cvUploads)
    .where(eq(cvUploads.userId, userId))
    .returning();
  if (!row) {
    return null;
  }
  try {
    await unlink(absoluteCvPath(row.filePath));
  } catch (error) {
    // Best-effort - a missing file on disk shouldn't block deleting the DB
    // row (e.g. storage/ was cleared out-of-band).
    console.error("Failed to delete CV file from disk:", error);
  }
  return row;
}
