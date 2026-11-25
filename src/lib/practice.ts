"use client";
import { db, newId } from "./db";
import { shuffle } from "./peerseus";
import type { PracticeAttempt, Question, Quiz } from "./types";

// ---------- Kuis mandiri (solo practice) ----------
// All questions of a published quiz, shuffled, with one time limit for the whole quiz that the user picks.
// Answers stay hidden until the run is handed in. Nothing here touches Elo, wins or topicStats.

export const PRACTICE_MAX_MINUTES = 120;
export const PRACTICE_PRESETS = [10, 30, 60, 120];
export const PRACTICE_COLLECTION = "practiceAttempts";

/** Default limit: 2 minutes per question, within 1..PRACTICE_MAX_MINUTES. */
export const defaultPracticeMinutes = (questions: number) => clampMinutes(questions * 2);
export const clampMinutes = (m: number) => Math.min(PRACTICE_MAX_MINUTES, Math.max(1, Math.round(m)));

/**
 * A run in progress, kept in this browser (localStorage) so a closed page can continue. The deadline is
 * absolute, so the clock keeps running while the page is closed. `order` holds indexes into quiz.questions
 * (questions are only ever added to a published quiz, so indexes stay valid); `answers[k]` is the option
 * picked for order[k], -1 = empty.
 */
export type PracticeRun = {
  quizId: string;
  order: number[];
  answers: number[];
  current: number;
  limitMinutes: number;
  startedAt: number;
  deadline: number;
};

const runKey = (uid: string, quizId: string) => `peerseus-practice:${uid}:${quizId}`;

export function loadRun(uid: string, quizId: string): PracticeRun | null {
  try {
    const raw = localStorage.getItem(runKey(uid, quizId));
    return raw ? (JSON.parse(raw) as PracticeRun) : null;
  } catch {
    return null;
  }
}

export function saveRun(uid: string, run: PracticeRun) {
  try {
    localStorage.setItem(runKey(uid, run.quizId), JSON.stringify(run));
  } catch {
    // Storage blocked or full: the run still works, it just can't be resumed after closing the page.
  }
}

export function clearRun(uid: string, quizId: string) {
  try {
    localStorage.removeItem(runKey(uid, quizId));
  } catch {
    // nothing to clear
  }
}

export function startRun(uid: string, quiz: Quiz, minutes: number): PracticeRun {
  const limitMinutes = clampMinutes(minutes);
  const now = Date.now();
  const run: PracticeRun = {
    quizId: quiz.id,
    order: shuffle(quiz.questions.map((_, i) => i)),
    answers: quiz.questions.map(() => -1),
    current: 0,
    limitMinutes,
    startedAt: now,
    deadline: now + limitMinutes * 60_000,
  };
  saveRun(uid, run);
  return run;
}

/** The run's questions in its order (skips any index the quiz no longer has). */
export function runQuestions(quiz: Quiz, run: PracticeRun): { question: Question; answer: number }[] {
  return run.order
    .map((qi, k) => ({ question: quiz.questions[qi], answer: run.answers[k] ?? -1 }))
    .filter((x) => x.question);
}

/** Scores the run, saves it to the owner's history and forgets the run in this browser. */
export async function finishRun(uid: string, quiz: Quiz, run: PracticeRun): Promise<PracticeAttempt> {
  const items = runQuestions(quiz, run);
  const now = Date.now();
  const attempt: PracticeAttempt = {
    id: `${uid}_${newId()}`,
    uid,
    quizId: quiz.id,
    materialId: quiz.materialId,
    courseId: quiz.courseId,
    questionIds: items.map((x) => x.question.id),
    answers: items.map((x) => x.answer),
    score: items.filter((x) => x.answer === x.question.answerIndex).length,
    total: items.length,
    limitMinutes: run.limitMinutes,
    usedMs: Math.max(0, Math.min(now, run.deadline) - run.startedAt),
    createdAt: now,
  };
  await db.set(PRACTICE_COLLECTION, attempt.id, attempt);
  clearRun(uid, quiz.id);
  return attempt;
}

/** My finished runs on one material, newest first. */
export async function myPracticeAttempts(uid: string, materialId: string): Promise<PracticeAttempt[]> {
  const list = await db.list<PracticeAttempt>(PRACTICE_COLLECTION, [["uid", "==", uid], ["materialId", "==", materialId]]);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/** Topics of the questions answered wrong or left empty, most missed first. */
export function practiceMissedTopics(items: { question: Question; answer: number }[]) {
  const miss: Record<string, number> = {};
  for (const { question, answer } of items) if (answer !== question.answerIndex) miss[question.topic] = (miss[question.topic] ?? 0) + 1;
  return Object.entries(miss).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** "1:05:09" or "12:30". */
export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1 jam 5 menit", "12 menit 30 detik", "45 detik". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return m ? `${h} jam ${m} menit` : `${h} jam`;
  if (m) return sec ? `${m} menit ${sec} detik` : `${m} menit`;
  return `${sec} detik`;
}

export const minutesLabel = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : `${m} menit`);
