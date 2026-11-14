import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function makePdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 18;
  }
  return doc.save();
}

export async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

/** A made-up rebuild guide, used by both test suites. */
export const REBUILD_GUIDE_MD = readFileSync(new URL("./rebuild-guide.md", import.meta.url), "utf8");

export const TRANSCRIPT_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
<v Instructor>Today we rebuild the workflow from the guide.

2
00:00:05.000 --> 00:00:09.000
<v Instructor>First, Get Document Data pulls the fields out of the file.

3
00:00:09.000 --> 00:00:14.000
<v Learner>I got an error when I opened the Core Agent settings.
`;

export function fileOf(bytes: Uint8Array | string, name: string, type = "application/octet-stream"): File {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return new File([data as BlobPart], name, { type });
}
