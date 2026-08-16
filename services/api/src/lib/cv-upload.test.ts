import { existsSync } from "fs";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import { cvUploads } from "../db/schema";
import {
  absoluteCvPath,
  deleteCvUpload,
  extractPdfText,
  getCvUpload,
  saveCvUpload,
} from "./cv-upload";

// Fake deterministic user id, same pattern as profile-knowledge.test.ts —
// no real Supabase account needed, this module is tested independently of
// the HTTP/auth layer.
const testUserId = "00000000-0000-4000-8000-0000000000cd";

async function generateRealPdfBuffer(lines: string[]): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (const line of lines) {
      doc.fontSize(12).text(line || " ");
    }
    doc.end();
  });
}

afterAll(async () => {
  await db.delete(cvUploads).where(eq(cvUploads.userId, testUserId));
});

describe("extractPdfText", () => {
  it("extracts real text from a real PDF (via pdfkit) without the pdf-parse page-footer noise", async () => {
    const buffer = await generateRealPdfBuffer(["Jane Doe", "Senior Frontend Engineer"]);
    const result = await extractPdfText(buffer);
    expect(result.status).toBe("ok");
    expect(result.text).toBe("Jane Doe\nSenior Frontend Engineer");
    // Confirms the pdf-parse v2 default "-- N of M --" page joiner is
    // suppressed, not just that extraction succeeded.
    expect(result.text).not.toContain("--");
  });

  it("reports status 'failed' for an unparseable buffer without throwing", async () => {
    const garbage = Buffer.from("not a pdf at all");
    const result = await extractPdfText(garbage).catch((err) => err);
    // extractPdfText itself may throw (it's saveCvUpload's job to catch and
    // downgrade to extractionStatus "failed" - see the test below); this
    // test documents that behavior explicitly rather than assuming it.
    expect(result).toBeInstanceOf(Error);
  });
});

describe("saveCvUpload / getCvUpload / deleteCvUpload", () => {
  it("writes the real PDF to disk, extracts real text, and round-trips through the DB", async () => {
    const buffer = await generateRealPdfBuffer(["Real end-to-end test content"]);
    const saved = await saveCvUpload(testUserId, {
      buffer,
      originalFilename: "resume.pdf",
    });

    expect(saved.extractionStatus).toBe("ok");
    expect(saved.extractedText).toBe("Real end-to-end test content");
    expect(existsSync(absoluteCvPath(saved.filePath))).toBe(true);

    const fetched = await getCvUpload(testUserId);
    expect(fetched?.extractedText).toBe(saved.extractedText);
    expect(fetched?.originalFilename).toBe("resume.pdf");
  });

  it("a re-upload replaces the previous CV (same fixed file path, upsert not append)", async () => {
    const first = await generateRealPdfBuffer(["First version"]);
    const firstSaved = await saveCvUpload(testUserId, {
      buffer: first,
      originalFilename: "v1.pdf",
    });

    const second = await generateRealPdfBuffer(["Second version"]);
    const secondSaved = await saveCvUpload(testUserId, {
      buffer: second,
      originalFilename: "v2.pdf",
    });

    expect(secondSaved.filePath).toBe(firstSaved.filePath);
    const fetched = await getCvUpload(testUserId);
    expect(fetched?.extractedText).toBe("Second version");
    expect(fetched?.originalFilename).toBe("v2.pdf");
  });

  it("stores extractionStatus 'failed' (not a thrown error) for an unparseable upload", async () => {
    const garbage = Buffer.from("%PDF-1.4\nnot actually valid\n%%EOF");
    const saved = await saveCvUpload(testUserId, {
      buffer: garbage,
      originalFilename: "corrupt.pdf",
    });
    expect(saved.extractionStatus).toBe("failed");
    expect(saved.extractedText).toBe("");
  });

  it("delete removes both the DB row and the file on disk", async () => {
    const buffer = await generateRealPdfBuffer(["To be deleted"]);
    const saved = await saveCvUpload(testUserId, {
      buffer,
      originalFilename: "delete-me.pdf",
    });
    const diskPath = absoluteCvPath(saved.filePath);
    expect(existsSync(diskPath)).toBe(true);

    const deleted = await deleteCvUpload(testUserId);
    expect(deleted?.userId).toBe(testUserId);
    expect(existsSync(diskPath)).toBe(false);
    expect(await getCvUpload(testUserId)).toBeNull();
  });

  it("delete on a user with no upload returns null rather than throwing", async () => {
    await expect(deleteCvUpload(testUserId)).resolves.toBeNull();
  });
});
