"use client";
import { db, newId } from "./db";
import type { Discussion, DiscussionAnswer, DiscussionVote, Material, Question, UserProfile } from "./types";

// ---------- Diskusi per materi dan per soal ----------
// Questions and answers about one public material. Counts are computed from three queries per material
// (db.ts has no transactions or increments), never stored. Who may change what is in firestore.rules
// (discussions, discussionAnswers, discussionVotes); the same checks run here so demo mode behaves alike.

export const DISCUSSIONS = "discussions";
export const ANSWERS = "discussionAnswers";
export const VOTES = "discussionVotes";

export const TITLE_MAX = 150;
export const BODY_MAX = 10000;

export type Me = Pick<UserProfile, "id" | "name">;

/** One answer with its upvotes, as shown on the page. */
export type AnswerView = DiscussionAnswer & { upvotes: number; voted: boolean };

/** One discussion with its answers (best answer first) and upvotes. */
export type DiscussionView = Discussion & {
  answers: AnswerView[];
  /** The chosen best answer, if it still exists. */
  best: AnswerView | null;
  upvotes: number;
  voted: boolean;
};

/** What a new or edited question holds. questionId "" = Umum. */
export type DiscussionDraft = { title: string; body: string; questionId: string };

export const voteId = (targetId: string, uid: string) => `${targetId}_${uid}`;

/** Who may pick (or take back) the best answer: the asker and the material's uploader. */
export const canPickBest = (d: Pick<Discussion, "authorId">, material: Pick<Material, "uploaderId">, uid: string) =>
  uid === d.authorId || uid === material.uploaderId;

/**
 * All discussions of one material, newest data from users/{id}: names follow renames, and anything written by
 * someone whose user document is gone (account deleted) is left out, like the leaderboard (courseMembers).
 * Order: no best answer yet first, then most upvotes, then newest.
 */
export async function loadDiscussions(materialId: string, uid: string): Promise<DiscussionView[]> {
  const where: ["materialId", "==", string][] = [["materialId", "==", materialId]];
  const [ds, as, vs] = await Promise.all([
    db.list<Discussion>(DISCUSSIONS, where),
    db.list<DiscussionAnswer>(ANSWERS, where),
    db.list<DiscussionVote>(VOTES, where),
  ]);
  const ids = [...new Set([...ds, ...as].map((x) => x.authorId))];
  const users = await Promise.all(ids.map((id) => db.get<UserProfile>("users", id).catch(() => null)));
  const names = new Map(ids.flatMap((id, i) => (users[i] ? [[id, users[i]!.name] as const] : [])));
  const live = <T extends { authorId: string; authorName: string }>(x: T): T[] =>
    names.has(x.authorId) ? [{ ...x, authorName: names.get(x.authorId) || x.authorName }] : [];

  const up = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of vs) {
    up.set(v.targetId, (up.get(v.targetId) ?? 0) + 1);
    if (v.uid === uid) mine.add(v.targetId);
  }
  const byDiscussion = new Map<string, AnswerView[]>();
  for (const a of as.flatMap(live)) {
    const list = byDiscussion.get(a.discussionId) ?? [];
    list.push({ ...a, upvotes: up.get(a.id) ?? 0, voted: mine.has(a.id) });
    byDiscussion.set(a.discussionId, list);
  }

  const views = ds.flatMap(live).map((d): DiscussionView => {
    const answers = byDiscussion.get(d.id) ?? [];
    const best = answers.find((a) => a.id === d.bestAnswerId) ?? null;
    // Best answer pinned first, then most upvotes, then oldest (answers read like a conversation).
    answers.sort((a, b) => Number(b === best) - Number(a === best) || b.upvotes - a.upvotes || a.createdAt - b.createdAt);
    return { ...d, answers, best, upvotes: up.get(d.id) ?? 0, voted: mine.has(d.id) };
  });
  return views.sort((a, b) => Number(!!a.best) - Number(!!b.best) || b.upvotes - a.upvotes || b.createdAt - a.createdAt);
}

/** What still blocks a question from being sent ("" = ready). */
export function discussionProblem(d: DiscussionDraft) {
  if (!d.title.trim()) return "Tulis judul pertanyaannya.";
  if (d.title.trim().length > TITLE_MAX) return `Judul maksimal ${TITLE_MAX} karakter.`;
  if (!d.body.trim()) return "Tulis isi pertanyaannya.";
  if (d.body.trim().length > BODY_MAX) return `Isi maksimal ${BODY_MAX} karakter.`;
  return "";
}

export function answerProblem(body: string) {
  if (!body.trim()) return "Tulis jawabannya.";
  if (body.trim().length > BODY_MAX) return `Jawaban maksimal ${BODY_MAX} karakter.`;
  return "";
}

/** questionId + topic for the chosen context; Umum (or a question no longer in the quiz) = neither. */
function context(questionId: string, questions: Question[]) {
  const q = questions.find((x) => x.id === questionId);
  return q ? { questionId: q.id, topic: q.topic } : { questionId: null, topic: null };
}

/** Same check as the rules: discussions only for materials in `materials` (public), never private ones. */
async function publicMaterial(materialId: string) {
  const m = await db.get<Material>("materials", materialId);
  if (!m || m.isPublic === false) throw new Error("Diskusi hanya ada di materi publik.");
  return m;
}

export async function askQuestion(material: Material, me: Me, draft: DiscussionDraft, questions: Question[]) {
  const problem = discussionProblem(draft);
  if (problem) throw new Error(problem);
  const m = await publicMaterial(material.id);
  const ctx = context(draft.questionId, questions);
  const d: Discussion = {
    id: newId("dq_"),
    materialId: m.id,
    courseId: m.courseId,
    ...(ctx.questionId && { questionId: ctx.questionId, topic: ctx.topic! }),
    title: draft.title.trim(),
    body: draft.body.trim(),
    authorId: me.id,
    authorName: me.name,
    createdAt: Date.now(),
    reports: 0,
  };
  await db.set(DISCUSSIONS, d.id, d);
  return d;
}

function mustOwn(x: { authorId: string }, uid: string) {
  if (x.authorId !== uid) throw new Error("Hanya penulisnya yang bisa mengubah atau menghapus ini.");
}

export async function editQuestion(d: Discussion, uid: string, draft: DiscussionDraft, questions: Question[]) {
  mustOwn(d, uid);
  const problem = discussionProblem(draft);
  if (problem) throw new Error(problem);
  // null clears the field in Firestore (an omitted field would be kept by updateDoc).
  // A question that has since left the quiz stays linked unless the asker picks another context.
  const ctx = draft.questionId && draft.questionId === d.questionId ? { questionId: d.questionId, topic: d.topic ?? null } : context(draft.questionId, questions);
  await db.update(DISCUSSIONS, d.id, { title: draft.title.trim(), body: draft.body.trim(), ...ctx, updatedAt: Date.now() });
}

/**
 * Deletes my question. Not allowed once someone else answered it, so their answers are not lost.
 * My own answers and every vote on it are left behind; nothing shows them without the question.
 */
export async function deleteQuestion(d: DiscussionView, uid: string) {
  mustOwn(d, uid);
  if (d.answers.some((a) => a.authorId !== uid)) throw new Error("Pertanyaan yang sudah dijawab orang lain tidak bisa dihapus. Kamu masih bisa mengeditnya.");
  await db.remove(DISCUSSIONS, d.id);
}

export async function answerQuestion(d: Discussion, me: Me, body: string) {
  const problem = answerProblem(body);
  if (problem) throw new Error(problem);
  const a: DiscussionAnswer = {
    id: newId("da_"),
    discussionId: d.id,
    materialId: d.materialId,
    body: body.trim(),
    authorId: me.id,
    authorName: me.name,
    createdAt: Date.now(),
    reports: 0,
  };
  await db.set(ANSWERS, a.id, a);
  return a;
}

export async function editAnswer(a: DiscussionAnswer, uid: string, body: string) {
  mustOwn(a, uid);
  const problem = answerProblem(body);
  if (problem) throw new Error(problem);
  await db.update(ANSWERS, a.id, { body: body.trim(), updatedAt: Date.now() });
}

/** Deletes my answer. If it was the best answer the question simply counts as unanswered again. */
export async function deleteAnswer(a: DiscussionAnswer, uid: string) {
  mustOwn(a, uid);
  await db.remove(ANSWERS, a.id);
}

/** Picks the best answer, or takes the choice back (answerId null). Only the asker or the uploader. */
export async function setBestAnswer(d: Discussion, material: Material, uid: string, answerId: string | null) {
  if (!canPickBest(d, material, uid)) throw new Error("Hanya penanya atau pengunggah materi yang bisa memilih jawaban terbaik.");
  await db.update(DISCUSSIONS, d.id, { bestAnswerId: answerId });
}

/** Upvote, or take my upvote back. Nobody upvotes their own question or answer. */
export async function toggleVote(target: { id: string; authorId: string; materialId: string; voted: boolean }, type: DiscussionVote["targetType"], uid: string) {
  if (target.authorId === uid) throw new Error("Tidak bisa upvote tulisan sendiri.");
  const id = voteId(target.id, uid);
  if (target.voted) return db.remove(VOTES, id);
  const v: DiscussionVote = { id, targetId: target.id, targetType: type, materialId: target.materialId, uid, createdAt: Date.now() };
  await db.set(VOTES, id, v);
}

/** Same pattern as reporting a material: one more report on the document. */
export async function report(type: DiscussionVote["targetType"], x: { id: string; reports: number }) {
  await db.update(type === "discussion" ? DISCUSSIONS : ANSWERS, x.id, { reports: (x.reports ?? 0) + 1 });
}
