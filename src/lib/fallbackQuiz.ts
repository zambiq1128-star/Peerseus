import type { Question } from "./types";

/**
 * Offline question maker used when GEMINI_API_KEY is not set: turns sentences
 * into fill-in-the-blank questions so the flow can still be demoed.
 */
export function fallbackQuiz(text: string, topics: string[], count: number): Question[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 6);
  const words = (s: string) => s.match(/[A-Za-zÀ-ÿ']{5,}/g) ?? [];
  const pool = Array.from(new Set(sentences.flatMap(words)));
  const out: Question[] = [];
  for (const s of sentences) {
    if (out.length >= count) break;
    const cands = words(s).sort((a, b) => b.length - a.length);
    const answer = cands[0];
    if (!answer) continue;
    const distractors = pool.filter((w) => w.toLowerCase() !== answer.toLowerCase()).sort(() => Math.random() - 0.5).slice(0, 3);
    if (distractors.length < 3) continue;
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
    const topic = topics.find((t) => s.toLowerCase().includes(t.toLowerCase())) ?? topics[0] ?? "Umum";
    out.push({
      id: `fb${out.length + 1}`,
      question: `Lengkapi kalimat berikut: "${s.replace(answer, "_____")}"`,
      options,
      answerIndex: options.indexOf(answer),
      explanation: `Kalimat aslinya: "${s}"`,
      topic,
    });
  }
  return out;
}
