import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { fallbackQuiz } from "@/lib/fallbackQuiz";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby maximum

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
// Long materials make Gemini slow; ~20k characters is plenty for 8 questions.
const MAX_TEXT_CHARS = 20000;
// Stop well before Vercel's 300 s limit so the user gets a clear error instead of a 504.
const GEMINI_TIMEOUT_MS = 240_000;

type Body = { title: string; topics: string[]; text?: string; fileUrl?: string; mimeType?: string; count?: number };

async function loadFile(url: string): Promise<{ data: string; mimeType: string } | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    return m ? { mimeType: m[1], data: m[2] } : null;
  }
  // Only fetch from Firebase Storage to avoid fetching arbitrary URLs from the server.
  const u = new URL(url);
  if (u.hostname !== "firebasestorage.googleapis.com" && !u.hostname.endsWith(".firebasestorage.app")) return null;
  const res = await fetch(u);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE_BYTES) return null;
  return { data: buf.toString("base64"), mimeType: res.headers.get("content-type") || "application/pdf" };
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const count = Math.min(Math.max(body.count ?? 8, 3), 15);
  const topics = (body.topics ?? []).filter(Boolean);
  const text = (body.text ?? "").slice(0, MAX_TEXT_CHARS);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const questions = fallbackQuiz(text, topics, count);
    if (!questions.length) {
      return NextResponse.json({ error: "GEMINI_API_KEY belum diatur dan materi tidak punya teks yang cukup untuk mode offline." }, { status: 400 });
    }
    return NextResponse.json({ questions, generator: "fallback" });
  }

  const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [];
  const isText = (t?: string) => !t || t.startsWith("text/");
  // The PDF's text is already extracted in the browser; only send the file when there is no text.
  if (!text.trim() && body.fileUrl && !isText(body.mimeType)) {
    const f = await loadFile(body.fileUrl);
    if (f) parts.push({ inlineData: f });
  }
  parts.push({
    text: `Kamu adalah asisten dosen untuk mata kuliah tingkat pertama universitas.
Buat ${count} soal pilihan ganda dalam Bahasa Indonesia dari materi "${body.title}".
Aturan:
- Setiap soal punya tepat 4 opsi dan tepat 1 jawaban benar (answerIndex 0–3).
- Soal harus bisa dijawab dari materi; jangan mengarang fakta di luar materi.
- Variasikan tingkat kesulitan: pemahaman konsep, hitungan singkat, dan penerapan.
- Isi "topic" dengan salah satu topik berikut: ${topics.length ? topics.join(", ") : "(tentukan topik singkat sendiri, 1–3 kata)"}.
- "explanation" menjelaskan singkat kenapa jawabannya benar.
${text ? `\nMateri:\n"""\n${text}\n"""` : ""}`,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        abortSignal: controller.signal,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
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
    });
    const raw = JSON.parse(res.text ?? "[]") as Omit<Question, "id">[];
    const questions: Question[] = raw
      .filter((q) => Array.isArray(q.options) && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4)
      .map((q, i) => ({ ...q, id: `g${i + 1}` }));
    if (!questions.length) throw new Error("Gemini tidak mengembalikan soal yang valid");
    return NextResponse.json({ questions, generator: "gemini" });
  } catch (e) {
    console.error(e);
    if (controller.signal.aborted) {
      return NextResponse.json({ error: "Gemini terlalu lama merespons (lebih dari 4 menit). Coba lagi, atau persingkat materinya." }, { status: 504 });
    }
    return NextResponse.json({ error: `Gagal memanggil Gemini: ${(e as Error).message}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
