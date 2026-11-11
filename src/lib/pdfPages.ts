"use client";

export const MAX_PDF_PAGES = 20;
/** Longest side of a rendered page in pixels: sharp enough for subscripts, still small as JPEG. */
const TARGET_PX = 1800;
/** Keep each request far below Vercel's 4.5 MB body limit (base64 adds ~33%). */
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

export type PageImage = { data: string; mimeType: "image/jpeg"; bytes: number };

export type PdfHandle = {
  numPages: number;
  text(page: number): Promise<string>;
  image(page: number): Promise<PageImage>;
  destroy(): void;
};

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal mengubah halaman jadi gambar"))), "image/jpeg", quality),
  );
}

/** Opens a PDF in the browser (pdf.js). Pages are rendered one at a time, on demand. */
export async function openPdf(file: File): Promise<PdfHandle> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  async function render(pageNo: number, scaleFactor: number, quality: number): Promise<Blob> {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, TARGET_PX / Math.max(base.width, base.height)) * scaleFactor;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await toJpeg(canvas, quality);
    canvas.width = canvas.height = 0; // free memory early
    page.cleanup();
    return blob;
  }

  return {
    numPages: doc.numPages,
    async text(pageNo) {
      const content = await (await doc.getPage(pageNo)).getTextContent();
      let out = "";
      for (const it of content.items) {
        if (!("str" in it)) continue;
        out += it.str + (it.hasEOL ? "\n" : " ");
      }
      return out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    },
    async image(pageNo) {
      let blob = await render(pageNo, 1, 0.82);
      // Very dense pages: shrink until small enough.
      for (const [f, q] of [[0.8, 0.7], [0.6, 0.6]] as const) {
        if (blob.size <= MAX_IMAGE_BYTES) break;
        blob = await render(pageNo, f, q);
      }
      return { data: await blobToBase64(blob), mimeType: "image/jpeg", bytes: blob.size };
    },
    destroy() {
      void doc.destroy();
    },
  };
}
