"use client";
import { db, newId } from "./db";
import type { Material, Question, QuestionProposal, Quiz, UserProfile } from "./types";

// ---------- Usul soal (proposed questions) ----------
// Anyone may propose a question for a published quiz; the material's uploader reviews it. Accepted questions
// are appended to quizzes/quiz_{materialId}, so duels and kuis mandiri both use them.

/** Questions per quiz, proposals included. Kuis mandiri uses them all, so this keeps a run within 2 hours. */
export const MAX_QUIZ_QUESTIONS = 30;
export const PROPOSALS = "questionProposals";

export const canAddQuestions = (quiz: Pick<Quiz, "status" | "questions">) => quiz.status === "published" && quiz.questions.length < MAX_QUIZ_QUESTIONS;

export function blankQuestion(topic = ""): Question {
  return { id: "", question: "", options: ["", "", "", ""], answerIndex: 0, explanation: "", topic };
}

/** What still blocks a proposed question from being sent or accepted ("" = ready). */
export function questionProblem(q: Question) {
  if (!q.question.trim()) return "Tulis pertanyaannya.";
  if (q.options.some((o) => !o.trim())) return "Isi keempat opsi jawaban.";
  if (new Set(q.options.map((o) => o.trim())).size < q.options.length) return "Opsi jawaban tidak boleh sama.";
  if (!q.explanation.trim()) return "Tulis pembahasan singkat.";
  if (!q.topic.trim()) return "Isi topiknya.";
  return "";
}

const tidy = (q: Question): Question => ({
  ...q,
  question: q.question.trim(),
  options: q.options.map((o) => o.trim()),
  explanation: q.explanation.trim(),
  topic: q.topic.trim(),
});

export async function proposeQuestion(quiz: Quiz, material: Material, me: Pick<UserProfile, "id" | "name">, q: Question) {
  if (!canAddQuestions(quiz)) throw new Error(`Kuis ini sudah ${MAX_QUIZ_QUESTIONS} soal.`);
  const problem = questionProblem(q);
  if (problem) throw new Error(problem);
  const p: QuestionProposal = {
    id: newId("qp_"),
    quizId: quiz.id,
    materialId: material.id,
    courseId: material.courseId,
    uploaderId: material.uploaderId,
    materialTitle: material.title,
    question: { ...tidy(q), id: newId("u") },
    proposerId: me.id,
    proposerName: me.name,
    status: "pending",
    createdAt: Date.now(),
  };
  await db.set(PROPOSALS, p.id, p);
  return p;
}

const newestFirst = (list: QuestionProposal[]) => list.sort((a, b) => b.createdAt - a.createdAt);

/** Proposals I sent for one material. */
export async function myProposals(uid: string, materialId: string) {
  return newestFirst(await db.list<QuestionProposal>(PROPOSALS, [["materialId", "==", materialId], ["proposerId", "==", uid]]));
}

/** Proposals waiting for me as the uploader: of one material, or of all my materials (home page). */
export async function proposalsToReview(uid: string, materialId?: string) {
  const [list, mine] = await Promise.all([
    db.list<QuestionProposal>(PROPOSALS, [["uploaderId", "==", uid], ["status", "==", "pending"]]),
    // Proposals for a material I deleted stay (only the proposer may remove them); skip them.
    db.list<{ id: string }>("materials", [["uploaderId", "==", uid]]),
  ]);
  const live = new Set(mine.map((m) => m.id));
  return newestFirst(list.filter((p) => live.has(p.materialId) && (!materialId || p.materialId === materialId)));
}

/** Adds the (possibly edited) question to the quiz, credited to the proposer. */
export async function acceptProposal(p: QuestionProposal, edited: Question) {
  const problem = questionProblem(edited);
  if (problem) throw new Error(problem);
  const quiz = await db.get<Quiz>("quizzes", p.quizId);
  if (!quiz || quiz.status !== "published") throw new Error("Kuisnya tidak ditemukan.");
  if (!canAddQuestions(quiz)) throw new Error(`Kuis ini sudah ${MAX_QUIZ_QUESTIONS} soal. Tolak usulan ini atau biarkan menunggu.`);
  const question: Question = { ...tidy(edited), id: p.question.id, proposedBy: { id: p.proposerId, name: p.proposerName, acceptedAt: Date.now() } };
  await db.update("quizzes", quiz.id, { questions: [...quiz.questions, question] });
  await db.update(PROPOSALS, p.id, { status: "accepted", question, reviewedAt: Date.now() });
}

export async function rejectProposal(p: QuestionProposal, reason: string) {
  await db.update(PROPOSALS, p.id, { status: "rejected", rejectReason: reason.trim(), reviewedAt: Date.now() });
}

/** The proposer takes back a proposal nobody has reviewed yet. */
export const withdrawProposal = (p: QuestionProposal) => db.remove(PROPOSALS, p.id);

// ---------- Kelola soal (the uploader edits a published quiz) ----------
// Duels copy their questions when created, so changes here only reach new duels and new practice runs.

/** Fewest questions a published quiz keeps (the same minimum as publishing a draft). */
export const MIN_QUIZ_QUESTIONS = 3;

async function publishedQuiz(quizId: string) {
  const quiz = await db.get<Quiz>("quizzes", quizId);
  if (!quiz || quiz.status !== "published") throw new Error("Kuisnya tidak ditemukan.");
  return quiz;
}

/** The uploader adds a question of their own: no review, straight into the quiz. */
export async function addOwnQuestion(quizId: string, q: Question) {
  const problem = questionProblem(q);
  if (problem) throw new Error(problem);
  const quiz = await publishedQuiz(quizId);
  if (!canAddQuestions(quiz)) throw new Error(`Kuis ini sudah ${MAX_QUIZ_QUESTIONS} soal.`);
  await db.update("quizzes", quiz.id, { questions: [...quiz.questions, { ...tidy(q), id: newId("o") }] });
}

/** Saves an edited question (matched by id); keeps who proposed it. */
export async function updateQuizQuestion(quizId: string, q: Question) {
  const problem = questionProblem(q);
  if (problem) throw new Error(problem);
  const quiz = await publishedQuiz(quizId);
  if (!quiz.questions.some((x) => x.id === q.id)) throw new Error("Soal ini sudah tidak ada di kuis.");
  await db.update("quizzes", quiz.id, { questions: quiz.questions.map((x) => (x.id === q.id ? { ...tidy(q), proposedBy: x.proposedBy } : x)) });
}

export async function deleteQuizQuestion(quizId: string, questionId: string) {
  const quiz = await publishedQuiz(quizId);
  if (quiz.questions.length <= MIN_QUIZ_QUESTIONS) throw new Error(`Kuis minimal ${MIN_QUIZ_QUESTIONS} soal.`);
  await db.update("quizzes", quiz.id, { questions: quiz.questions.filter((x) => x.id !== questionId) });
}

export const PROPOSAL_STATUS: Record<QuestionProposal["status"], string> = { pending: "Menunggu", accepted: "Diterima", rejected: "Ditolak" };
