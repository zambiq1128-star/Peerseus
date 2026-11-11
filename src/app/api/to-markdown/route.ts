import { errorResponse, generate, GeminiError } from "@/lib/gemini";
import { normalizeMath, stripFence } from "@/lib/latex";

export const runtime = "nodejs";
// One page or one ~4,000-character part per request, so a minute is plenty.
export const maxDuration = 60;
const BUDGET_MS = 50_000;
const ATTEMPT_MS = 35_000;

const MAX_IMAGE_CHARS = 4_000_000; // base64; Vercel rejects bodies over 4.5 MB anyway
const MAX_TEXT_CHARS = 12_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Body = {
  mode: "page" | "text";
  image?: string; // base64 without the data: prefix
  mimeType?: string;
  text?: string;
  page?: number;
  total?: number;
};

const RULES = `Aturan penulisan:
- Tulis dalam Markdown. Judul bagian pakai #, ##, ###. Daftar pakai - atau 1.
- Semua notasi matematika pakai LaTeX: $...$ untuk rumus dalam kalimat, dan $$...$$ di baris tersendiri untuk rumus blok.
- Vektor ditulis seperti aslinya: panah jadi \\vec{F}, huruf tebal jadi \\mathbf{F}, vektor satuan seperti \\hat{i}.
- Pangkat dan indeks harus jelas: x^{2}, v_{0}, \\Delta t, \\frac{a}{b}, \\sqrt{x}. Satuan pakai \\,\\mathrm{m/s}^2 atau ditulis biasa di luar rumus.
- Tabel pakai tabel Markdown.
- Gambar atau diagram: tulis *[Gambar: deskripsi singkat isi gambar]*.
- Jangan pakai HTML.
- Jangan merangkum, jangan menambah penjelasan, jangan mengubah angka, simbol, atau urutan isi.
- Jawab hanya dengan isi Markdown-nya, tanpa kalimat pembuka atau penutup, dan tanpa membungkusnya dengan \`\`\`.`;

function pagePrompt(b: Body, extracted: string) {
  return `Transkripsikan halaman ${b.page ?? "?"} dari ${b.total ?? "?"} pada gambar ini secara lengkap dan setia ke Markdown + LaTeX.
Lewati nomor halaman serta header/footer yang berulang.
${RULES}
${extracted.trim()
    ? `\nBerikut teks hasil ekstraksi otomatis dari halaman yang sama. Notasinya mungkin rusak (pangkat, indeks, dan pecahan jadi berjajar), tapi angka dan ejaannya bisa dipakai sebagai pembanding. Ikuti gambar untuk struktur dan notasi.\n"""\n${extracted.trim()}\n"""`
    : "\nHalaman ini mungkin hasil scan, jadi baca langsung dari gambarnya."}`;
}

function textPrompt(b: Body) {
  return `Rapikan teks berikut (bagian ${b.page ?? 1} dari ${b.total ?? 1}) menjadi Markdown + LaTeX yang setia pada isinya.
Teks ini disalin dari dokumen, jadi notasi matematika mungkin rusak: misalnya "x2" yang maksudnya x^{2}, "v0" yang maksudnya v_{0}, atau pecahan yang jadi berjajar. Perbaiki notasinya hanya kalau maksudnya jelas dari konteks.
${RULES}

Teks:
"""
${b.text}
"""`;
}

export async function POST(req: Request) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Permintaan tidak valid.", code: "bad_request" }, { status: 400 });
  }
  const text = (b.text ?? "").slice(0, MAX_TEXT_CHARS);
  const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [];
  if (b.mode === "page") {
    if (!b.image || !IMAGE_TYPES.has(b.mimeType ?? "") || b.image.length > MAX_IMAGE_CHARS) {
      return Response.json({ error: "Gambar halaman tidak valid atau terlalu besar.", code: "bad_request" }, { status: 400 });
    }
    parts.push({ inlineData: { data: b.image, mimeType: b.mimeType! } }, { text: pagePrompt(b, text) });
  } else if (b.mode === "text") {
    if (!text.trim()) return Response.json({ error: "Teksnya kosong.", code: "bad_request" }, { status: 400 });
    parts.push({ text: textPrompt({ ...b, text }) });
  } else {
    return Response.json({ error: "Mode tidak dikenal.", code: "bad_request" }, { status: 400 });
  }

  try {
    const { text: out, model } = await generate({
      contents: [{ role: "user", parts }],
      config: { temperature: 0, maxOutputTokens: 8192 },
      deadline: Date.now() + BUDGET_MS,
      attemptMs: ATTEMPT_MS,
    });
    const markdown = normalizeMath(stripFence(out));
    if (!markdown) throw new GeminiError(502, "empty after cleanup", "empty");
    return Response.json({ markdown, model });
  } catch (e) {
    return errorResponse(e);
  }
}
