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

export type TipTapMark = { type: "bold" | "italic" };
export type TipTapTextNode = {
  type: "text";
  text: string;
  marks?: TipTapMark[];
};
export type TipTapInlineNode = TipTapTextNode | { type: "hardBreak" };

export type TipTapParagraphNode = {
  type: "paragraph";
  content?: TipTapInlineNode[];
};

export type TipTapHeadingNode = {
  type: "heading";
  attrs: { level: 1 | 2 };
  content?: TipTapInlineNode[];
};

export type TipTapListItemNode = {
  type: "listItem";
  content?: TipTapParagraphNode[];
};

export type TipTapBulletListNode = {
  type: "bulletList";
  content?: TipTapListItemNode[];
};

export type TipTapBlockNode =
  | TipTapParagraphNode
  | TipTapHeadingNode
  | TipTapBulletListNode;

export type TipTapDoc = {
  type: "doc";
  content?: TipTapBlockNode[];
};

type SeedBlock =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; items: string[] };

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

/** Legacy/heuristic block parser — used as the TipTap seed converter. */
export function parseDocumentBlocks(content: string): SeedBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: SeedBlock[] = [];
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
  };

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push({ kind: "bullet", items: bulletItems });
      bulletItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^---+$/.test(line)) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      bulletItems.push(bulletMatch[1].trim());
      continue;
    }

    flushBullets();

    const markdownHeading = line.match(/^(#{1,3})\s+(.+)$/);
    const boldHeading = line.match(/^\*\*(.+)\*\*$/);
    if (markdownHeading) {
      flushParagraph();
      const level = markdownHeading[1].length === 1 ? 1 : 2;
      blocks.push({
        kind: "heading",
        level,
        text: markdownHeading[2].replace(/:$/, "").trim(),
      });
      continue;
    }

    if (boldHeading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: 2,
        text: boldHeading[1].replace(/:$/, "").trim(),
      });
      continue;
    }

    const plain = line;
    const isAllCapsHeading =
      /^[A-Z][A-Z0-9 &/-]{2,40}$/.test(plain) && !plain.includes(".");
    if (isAllCapsHeading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: 2,
        text: plain.replace(/:$/, "").trim(),
      });
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushBullets();
  return blocks;
}

function inlineNodesFromPlain(text: string): TipTapInlineNode[] {
  const nodes: TipTapInlineNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      nodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "bold" }],
      });
    } else if (match[2] !== undefined) {
      nodes.push({
        type: "text",
        text: match[2],
        marks: [{ type: "italic" }],
      });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  if (nodes.length === 0) {
    nodes.push({ type: "text", text });
  }

  return nodes;
}

export function plainTextToTipTapJson(content: string): TipTapDoc {
  const blocks = parseDocumentBlocks(content);
  const docContent: TipTapBlockNode[] = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      docContent.push({
        type: "heading",
        attrs: { level: block.level },
        content: [{ type: "text", text: block.text }],
      });
    } else if (block.kind === "bullet") {
      docContent.push({
        type: "bulletList",
        content: block.items.map((item) => ({
          type: "listItem" as const,
          content: [
            {
              type: "paragraph" as const,
              content: inlineNodesFromPlain(item),
            },
          ],
        })),
      });
    } else {
      docContent.push({
        type: "paragraph",
        content: inlineNodesFromPlain(block.text),
      });
    }
  }

  return { type: "doc", content: docContent };
}

function collectTextFromInlines(nodes: TipTapInlineNode[] | undefined): string {
  if (!nodes) {
    return "";
  }
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n";
      }
      return node.text;
    })
    .join("");
}

export function tipTapJsonToPlainText(doc: TipTapDoc): string {
  const lines: string[] = [];

  for (const block of doc.content ?? []) {
    if (block.type === "heading") {
      const text = collectTextFromInlines(block.content).trim();
      if (text) {
        const prefix = block.attrs.level === 1 ? "# " : "## ";
        lines.push(`${prefix}${text}`);
        lines.push("");
      }
    } else if (block.type === "bulletList") {
      for (const item of block.content ?? []) {
        const paragraph = item.content?.[0];
        const text = collectTextFromInlines(paragraph?.content).trim();
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push("");
    } else if (block.type === "paragraph") {
      const text = collectTextFromInlines(block.content).trim();
      if (text) {
        lines.push(text);
        lines.push("");
      }
    }
  }

  return lines.join("\n").trim();
}

function textRunsFromInlines(
  nodes: TipTapInlineNode[] | undefined,
  options?: { size?: number; font?: string },
): TextRun[] {
  const size = options?.size ?? 22;
  const font = options?.font ?? "Calibri";
  if (!nodes || nodes.length === 0) {
    return [new TextRun({ text: "", size, font })];
  }

  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      runs.push(new TextRun({ break: 1, size, font }));
      continue;
    }
    const marks = node.marks ?? [];
    runs.push(
      new TextRun({
        text: node.text,
        bold: marks.some((mark) => mark.type === "bold"),
        italics: marks.some((mark) => mark.type === "italic"),
        size,
        font,
      }),
    );
  }
  return runs;
}

async function writeDocxFromTipTap(
  absolutePath: string,
  title: string,
  docJson: TipTapDoc,
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

  for (const block of docJson.content ?? []) {
    if (block.type === "heading") {
      children.push(
        new Paragraph({
          heading:
            block.attrs.level === 1
              ? HeadingLevel.HEADING_1
              : HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: textRunsFromInlines(block.content, {
            size: block.attrs.level === 1 ? 28 : 24,
          }),
        }),
      );
    } else if (block.type === "bulletList") {
      for (const item of block.content ?? []) {
        const paragraph = item.content?.[0];
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: textRunsFromInlines(paragraph?.content),
          }),
        );
      }
    } else if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 160, line: 276 },
          children: textRunsFromInlines(block.content),
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

async function writePdfFromTipTap(
  absolutePath: string,
  title: string,
  docJson: TipTapDoc,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const doc = new PDFDocument({
      margin: 54,
      size: "A4",
      info: { Title: title },
    });
    const stream = createWriteStream(absolutePath);
    doc.pipe(stream);

    stream.on("finish", () => resolvePromise());
    stream.on("error", reject);
    doc.on("error", reject);

    try {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111");
      doc.text(title, { align: "left" });
      doc.moveDown(0.8);

      const blocks = docJson.content ?? [];
      for (const block of blocks) {
        if (block.type === "heading") {
          const headingText = collectTextFromInlines(block.content);
          doc.moveDown(0.3);
          doc
            .font("Helvetica-Bold")
            .fontSize(block.attrs?.level === 1 ? 14 : 12)
            .fillColor("#111111")
            .text(headingText || " ", { align: "left" });
          doc.moveDown(0.2);
        } else if (block.type === "bulletList") {
          for (const item of block.content ?? []) {
            const paragraph = item.content?.[0];
            const bulletText = collectTextFromInlines(paragraph?.content);
            doc
              .font("Helvetica")
              .fontSize(11)
              .fillColor("#222222")
              .text(`• ${bulletText}`, { indent: 18, lineGap: 2 });
          }
          doc.moveDown(0.2);
        } else if (block.type === "paragraph") {
          // Flatten marks to a single string for PDF reliability; DOCX keeps rich runs.
          const paragraphText = collectTextFromInlines(block.content);
          doc
            .font("Helvetica")
            .fontSize(11)
            .fillColor("#222222")
            .text(paragraphText || " ", { align: "left", lineGap: 3 });
          doc.moveDown(0.3);
        }
      }
    } catch (error) {
      reject(error);
      return;
    }

    doc.end();
  });
}

export async function writeGeneratedDocumentsFromJson(options: {
  applicationId: string;
  docType: DocumentKind;
  contentJson: TipTapDoc;
}): Promise<{ stem: string; docxPath: string; pdfPath: string }> {
  const stem = documentStem(options.applicationId, options.docType);
  const docxPath = absoluteDocumentPath(stem, "docx");
  const pdfPath = absoluteDocumentPath(stem, "pdf");
  const title =
    options.docType === "cv" ? "Curriculum Vitae" : "Cover Letter";

  await mkdir(dirname(docxPath), { recursive: true });
  await writeDocxFromTipTap(docxPath, title, options.contentJson);
  await writePdfFromTipTap(pdfPath, title, options.contentJson);

  return { stem, docxPath, pdfPath };
}
