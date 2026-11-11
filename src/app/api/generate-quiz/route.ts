import { Type } from "@google/genai";
import { fallbackQuiz } from "@/lib/fallbackQuiz";
import { errorResponse, generate, GeminiError } from "@/lib/gemini";
import { repairLatexEscapes } from "@/lib/latex";
import { pickRelevant } from "@/lib/quizContext";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;
// All retries together stay well under maxDuration so the user gets a clear message, not a Vercel 504.
const BUDGET_MS = 100_000;
const ATTEMPT_MS = 55_000;
const MAX_CONTEXT_CHARS = 15_000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

type Body = { title: string; topics: string[]; text?: string; fileUrl?: string; mimeType?: string; count?: number };

/** Old materials without text may only have an attached file (data: URL or Firebase Storage). */
async function loadFile(url: string): Promise<{ data: string; mimeType: string } | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    return m ? { mimeType: m[1], data: m[2] } : null;
  }
  const u = new URL(url);
  if (u.hostname !== "firebasestorage.googleapis.com" && !u.hostname.endsWith(".firebasestorage.app")) return null;
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE_BYTES) return null;
  return { data: buf.toString("base64"), mimeType: res.headers.get("content-type") || "application/pdf" };
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const count = Math.min(Math.max(body.count ?? 8, 3), 15);
  const topics = (body.topics ?? []).filter(Boolean);
  const fullText = (body.text ?? "").trim();
  const text = pickRelevant(fullText, [body.title ?? "", ...topics], MAX_CONTEXT_CHARS);

  if (!process.env.GEMINI_API_KEY) {
    const questions = fallbackQuiz(text, topics, count);
    if (!questions.length) {
      return Response.json({ error: "Fitur AI belum aktif (GEMINI_API_KEY belum diatur) dan materi ini terlalu pendek untuk pembuat soal offline." }, { status: 400 });
    }
    return Response.json({ questions, generator: "fallback" });
  }

  try {
    const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [];
    const isText = (t?: string) => !t || t.startsWith("text/");
    if (!text && body.fileUrl && !isText(body.mimeType)) {
      const f = await loadFile(body.fileUrl).catch(() => null);
      if (f) parts.push({ inlineData: f });
    }
    if (!text && !parts.length) {
      return Response.json({ error: "Materi ini belum punya isi teks. Edit materinya dulu, lalu buat kuis lagi." }, { status: 400 });
    }
    parts.push({
      text: `Kamu adalah asisten dosen untuk mata kuliah tingkat pertama universitas.
Buat ${count} soal pilihan ganda dalam Bahasa Indonesia dari materi "${body.title}".
Aturan:
- Setiap soal punya tepat 4 opsi dan tepat 1 jawaban benar (answerIndex 0 sampai 3).
- Soal harus bisa dijawab dari materi; jangan mengarang fakta di luar materi.
- Variasikan tingkat kesulitan: pemahaman konsep, hitungan singkat, dan penerapan.
- Notasi matematika di soal, opsi, dan pembahasan pakai LaTeX di antara $...$, misalnya $\\vec{F} = m\\vec{a}$ atau $v_{0}^{2}$. Jangan pakai $$...$$.
- Isi "topic" dengan salah satu topik berikut: ${topics.length ? topics.join(", ") : "(tentukan topik singkat sendiri, 1 sampai 3 kata)"}.
- "explanation" menjelaskan singkat kenapa jawabannya benar.
${text ? `\nMateri (Markdown + LaTeX):\n"""\n${text}\n"""` : ""}`,
    });

    // A rare broken/truncated JSON answer gets one more try while there is time left.
    for (let round = 0; ; round++) {
      const { text: out, model } = await generate({
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answerIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                topic: { type: Type.STRING },
              },
              required: ["question", "options", "answerIndex", "explanation", "topic"],
            },
          },
        },
        deadline: started + BUDGET_MS,
        attemptMs: ATTEMPT_MS,
      });

      let raw: Omit<Question, "id">[] = [];
      try {
        raw = JSON.parse(out);
      } catch {
        console.error(`[generate-quiz] invalid JSON from ${model} (${out.length} chars)`);
      }
      const fix = repairLatexEscapes;
      const questions: Question[] = (Array.isArray(raw) ? raw : [])
        .filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4 && q.question)
        .map((q, i) => ({
          id: `g${i + 1}`,
          question: fix(q.question),
          options: q.options.map((o) => fix(String(o))),
          answerIndex: q.answerIndex,
          explanation: fix(q.explanation ?? ""),
          topic: q.topic || topics[0] || "Umum",
        }));
      if (!questions.length) {
        if (round === 0 && Date.now() - started < BUDGET_MS / 2) continue;
        throw new GeminiError(502, "no valid questions", "empty");
      }
      console.log(`[generate-quiz] ${questions.length} soal via ${model} dalam ${Date.now() - started} ms (konteks ${text.length}/${fullText.length} karakter)`);
      return Response.json({ questions, generator: "gemini" });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
