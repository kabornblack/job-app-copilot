import { mkdir, writeFile } from "fs/promises";
import { createWriteStream } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";

export type DocumentKind = "cv" | "cover_letter";
export type DocumentFormat = "docx" | "pdf";

type TextBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };

const __dirname = dirname(fileURLToPath(import.meta.url));
/** services/api */
export const apiRootDir = resolve(__dirname, "..", "..");

export function documentStem(
  applicationId: string,
  docType: DocumentKind,
): string {
  return `storage/generated/${applicationId}/${docType}`;
}

export function absoluteDocumentPath(
  stem: string,
  format: DocumentFormat,
): string {
  return resolve(apiRootDir, `${stem}.${format}`);
}

export function parseDocumentBlocks(content: string): TextBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: TextBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const markdownHeading = line.match(/^#{1,3}\s+(.+)$/);
    const boldHeading = line.match(/^\*\*(.+)\*\*$/);
    const plain = markdownHeading?.[1] ?? boldHeading?.[1] ?? line;
    const isHeading =
      Boolean(markdownHeading || boldHeading) ||
      (/^[A-Z][A-Z0-9 &/\-]{2,40}$/.test(plain) && !plain.includes("."));

    if (isHeading) {
      flushParagraph();
      blocks.push({ kind: "heading", text: plain.replace(/:$/, "").trim() });
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

async function writeDocxFile(
  absolutePath: string,
  title: string,
  blocks: TextBlock[],
): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32,
          font: "Calibri",
        }),
      ],
    }),
  ];

  for (const block of blocks) {
    if (block.kind === "heading") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: block.text,
              bold: true,
              size: 24,
              font: "Calibri",
            }),
          ],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 160, line: 276 },
          children: [
            new TextRun({
              text: block.text,
              size: 22,
              font: "Calibri",
            }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(absolutePath, buffer);
}

async function writePdfFile(
  absolutePath: string,
  title: string,
  blocks: TextBlock[],
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const doc = new PDFDocument({
      margin: 54,
      size: "A4",
      info: { Title: title },
    });
    const stream = createWriteStream(absolutePath);
    doc.pipe(stream);

    doc.font("Helvetica-Bold").fontSize(16).text(title, { align: "left" });
    doc.moveDown(0.8);

    for (const block of blocks) {
      if (block.kind === "heading") {
        doc.moveDown(0.4);
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#111111")
          .text(block.text, { align: "left" });
        doc.moveDown(0.25);
      } else {
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#222222")
          .text(block.text, {
            align: "left",
            lineGap: 3,
          });
        doc.moveDown(0.35);
      }
    }

    doc.end();
    stream.on("finish", () => resolvePromise());
    stream.on("error", reject);
    doc.on("error", reject);
  });
}

export async function writeGeneratedDocuments(options: {
  applicationId: string;
  docType: DocumentKind;
  content: string;
}): Promise<{ stem: string; docxPath: string; pdfPath: string }> {
  const stem = documentStem(options.applicationId, options.docType);
  const docxPath = absoluteDocumentPath(stem, "docx");
  const pdfPath = absoluteDocumentPath(stem, "pdf");
  const title =
    options.docType === "cv" ? "Curriculum Vitae" : "Cover Letter";
  const blocks = parseDocumentBlocks(options.content);

  await mkdir(dirname(docxPath), { recursive: true });
  await writeDocxFile(docxPath, title, blocks);
  await writePdfFile(pdfPath, title, blocks);

  return { stem, docxPath, pdfPath };
}
