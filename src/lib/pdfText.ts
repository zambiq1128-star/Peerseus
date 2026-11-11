"use client";

const MAX_PAGES = 60;
const MAX_CHARS = 60000;

/** Reads the text layer of a PDF in the browser. Returns "" for scanned (image-only) PDFs. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let out = "";
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES) && out.length < MAX_CHARS; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const line = content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (line) out += line + "\n";
  }
  await doc.destroy();
  return out.slice(0, MAX_CHARS).trim();
}
