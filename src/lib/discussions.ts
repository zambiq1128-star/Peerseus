"use client";
import { db, newId } from "./db";
import type { Discussion, DiscussionAnswer, DiscussionKind, DiscussionVote, Material, Opportunity, Question, UserProfile } from "./types";

// ---------- Diskusi per materi, per soal, dan per peluang ----------
// Questions and answers attached to exactly one parent: a public material or an opportunity (Hub Peluang).
// Answers and votes copy their discussion's parent id, so one page needs three queries on that id. Counts are
// computed from those queries (db.ts has no transactions or increments), never stored. Who may change what is in
// firestore.rules (discussions, discussionAnswers, discussionVotes); the same checks run here so demo mode behaves alike.

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

/**
 * What a discussion hangs on. ownerId = the material's uploader or the opportunity's sharer (postedBy; "seed" for
 * the samples, which is nobody), who may pick the best answer next to the asker.
 */
export type DiscussionParent = { kind: "material" | "opportunity"; id: string; ownerId: string };
type ParentRef = Pick<DiscussionParent, "kind" | "id">;

/** The field that holds the parent id, on discussions, answers and votes alike. */
const parentField = (p: Pick<DiscussionParent, "kind">) => (p.kind === "material" ? "materialId" : "opportunityId");

/** { materialId } or { opportunityId }, copied from a discussion (or answer) onto what hangs under it. */
const parentIdOf = (x: Pick<Discussion, "materialId" | "opportunityId">) =>
  x.opportunityId ? { opportunityId: x.opportunityId } : { materialId: x.materialId! };

/** Parent of a stored discussion (old ones only have materialId). */
export const parentRefOf = (d: Pick<Discussion, "materialId" | "opportunityId">): ParentRef =>
  d.opportunityId ? { kind: "opportunity", id: d.opportunityId } : { kind: "material", id: d.materialId! };

/** Where the Diskusi section of a parent lives. */
export const parentHref = (p: ParentRef) => `/${p.kind === "material" ? "materials" : "opportunities"}/${p.id}#diskusi`;

export const KIND_LABEL: Record<DiscussionKind, string> = { tanya: "Tanya", "cari-tim": "Cari tim" };
export const kindOf = (d: Pick<Discussion, "kind">): DiscussionKind => d.kind ?? "tanya";

/**
 * What a new or edited question holds. questionId "" = Umum (materials only); kind is used on opportunities only,
 * materials always stay "tanya".
 */
export type DiscussionDraft = { title: string; body: string; questionId: string; kind: DiscussionKind };

export const voteId = (targetId: string, uid: string) => `${targetId}_${uid}`;

/** Who may pick (or take back) the best answer: the asker and the parent's owner (uploader or sharer). */
export const canPickBest = (d: Pick<Discussion, "authorId">, parent: Pick<DiscussionParent, "ownerId">, uid: string) =>
  uid === d.authorId || uid === parent.ownerId;

/**
 * All discussions of one material or opportunity, newest data from users/{id}: names follow renames, and anything written by
 * someone whose user document is gone (account deleted) is left out, like the leaderboard (courseMembers).
 * Order: no best answer yet first, then most upvotes, then newest.
 */
export async function loadDiscussions(parent: ParentRef, uid: string): Promise<DiscussionView[]> {
  const where: [string, "==", string][] = [[parentField(parent), "==", parent.id]];
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

/**
 * The parent part of a new discussion. Materials: materialId + courseId (+ quiz question), never `kind`, so new
 * material discussions look exactly like before. Opportunities: opportunityId + kind, nothing material-only.
 */
async function parentPart(parent: ParentRef, draft: DiscussionDraft, questions: Question[]) {
  if (parent.kind === "material") {
    const m = await publicMaterial(parent.id);
    const ctx = context(draft.questionId, questions);
    return { materialId: m.id, courseId: m.courseId, ...(ctx.questionId && { questionId: ctx.questionId, topic: ctx.topic! }) };
  }
  if (!(await db.get<Opportunity>("opportunities", parent.id))) throw new Error("Peluang ini sudah tidak ada.");
  return { opportunityId: parent.id, kind: draft.kind };
}

export async function askQuestion(parent: ParentRef, me: Me, draft: DiscussionDraft, questions: Question[] = []) {
  const problem = discussionProblem(draft);
  if (problem) throw new Error(problem);
  const d: Discussion = {
    id: newId("dq_"),
    ...(await parentPart(parent, draft, questions)),
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

export async function editQuestion(d: Discussion, uid: string, draft: DiscussionDraft, questions: Question[] = []) {
  mustOwn(d, uid);
  const problem = discussionProblem(draft);
  if (problem) throw new Error(problem);
  // Opportunities: title, body and Tanya/Cari tim only (the rules refuse questionId/topic there).
  if (d.opportunityId) {
    await db.update(DISCUSSIONS, d.id, { title: draft.title.trim(), body: draft.body.trim(), kind: draft.kind, updatedAt: Date.now() });
    return;
  }
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
    ...parentIdOf(d),
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

/** Picks the best answer, or takes the choice back (answerId null). Only the asker or the parent's owner. */
export async function setBestAnswer(d: Discussion, parent: DiscussionParent, uid: string, answerId: string | null) {
  if (!canPickBest(d, parent, uid)) {
    throw new Error(`Hanya penanya atau ${parent.kind === "material" ? "pengunggah materi" : "yang membagikan peluang"} yang bisa memilih jawaban terbaik.`);
  }
  await db.update(DISCUSSIONS, d.id, { bestAnswerId: answerId });
}

/** Upvote, or take my upvote back. Nobody upvotes their own question or answer. */
export async function toggleVote(
  target: Pick<Discussion, "materialId" | "opportunityId"> & { id: string; authorId: string; voted: boolean },
  type: DiscussionVote["targetType"],
  uid: string,
) {
  if (target.authorId === uid) throw new Error("Tidak bisa upvote tulisan sendiri.");
  const id = voteId(target.id, uid);
  if (target.voted) return db.remove(VOTES, id);
  const v: DiscussionVote = { id, targetId: target.id, targetType: type, ...parentIdOf(target), uid, createdAt: Date.now() };
  await db.set(VOTES, id, v);
}

/** Same pattern as reporting a material: one more report on the document. */
export async function report(type: DiscussionVote["targetType"], x: { id: string; reports: number }) {
  await db.update(type === "discussion" ? DISCUSSIONS : ANSWERS, x.id, { reports: (x.reports ?? 0) + 1 });
}

// ---------- Tautan "Bahas soal ini" ----------

/** Link into the Diskusi section of a material, filtered to one quiz question (Discussions reads ?soal=). */
export const discussionHref = (materialId: string, questionId: string) => `/materials/${materialId}?soal=${encodeURIComponent(questionId)}#diskusi`;

/**
 * Discussions per quiz question of one material, for the "Bahas soal ini" / "Lihat diskusi (N)" links.
 * null = this material has no discussions at all (private, or gone), so no link should be shown.
 */
export async function questionDiscussionCounts(materialId: string, uid: string): Promise<Map<string, number> | null> {
  const m = await db.get<Material>("materials", materialId).catch(() => null);
  if (!m || m.isPublic === false) return null;
  const counts = new Map<string, number>();
  for (const d of await loadDiscussions({ kind: "material", id: materialId }, uid)) if (d.questionId) counts.set(d.questionId, (counts.get(d.questionId) ?? 0) + 1);
  return counts;
}

// ---------- Penanda di beranda ----------

/**
 * One material or opportunity with discussions that need me. `keys` are the "seen" keys that clicking the row
 * marks as seen; `href` opens its Diskusi section.
 */
export type DiscussionNotice = { parentId: string; title: string; href: string; count: number; keys: string[]; /** Every counted question is a "Cari tim": its answers read as replies ("dibalas"), not answers. */ replied?: boolean };

const SEEN_KEY = (uid: string) => `peerseus:diskusi-dilihat:${uid}`;

/** Keys I already looked at, kept in this browser only. Never throws (private mode, blocked storage). */
export function readSeen(uid: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY(uid)) || "[]"));
  } catch {
    return new Set();
  }
}

export function markSeen(uid: string, keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY(uid), JSON.stringify([...new Set([...readSeen(uid), ...keys])].slice(-500)));
  } catch {
    // Not remembered: the marker simply shows again next time.
  }
}

/** A parent I may need to look at: its title, whether I own it, and its discussions. */
type Loaded = { ref: ParentRef; title: string; owned: boolean; ds: DiscussionView[] };

/**
 * Home markers. toAnswer: questions from others without any answer on materials I uploaded, oppToAnswer: the
 * same on opportunities I shared (key `q:id` for both). answered: my questions (on materials and opportunities)
 * that got an answer from someone else; the key holds the number of such answers (`a:id:n`), so a later answer
 * shows the marker again. All skip what I already opened (see markSeen).
 */
export async function discussionNotices(uid: string): Promise<{ toAnswer: DiscussionNotice[]; oppToAnswer: DiscussionNotice[]; answered: DiscussionNotice[] }> {
  const [mats, opps, asked] = await Promise.all([
    db.list<Material>("materials", [["uploaderId", "==", uid]]),
    db.list<Opportunity>("opportunities", [["postedBy", "==", uid]]),
    db.list<Discussion>(DISCUSSIONS, [["authorId", "==", uid]]),
  ]);
  // Every parent once: what I own, plus the parents of my own questions.
  const refs = new Map<string, ParentRef>();
  for (const m of mats) refs.set(`material:${m.id}`, { kind: "material", id: m.id });
  for (const o of opps) refs.set(`opportunity:${o.id}`, { kind: "opportunity", id: o.id });
  for (const d of asked) {
    const r = parentRefOf(d);
    refs.set(`${r.kind}:${r.id}`, r);
  }
  const loaded = await Promise.all([...refs.values()].map(async (ref): Promise<Loaded | null> => {
    if (ref.kind === "material") {
      const [m, ds] = await Promise.all([mats.find((x) => x.id === ref.id) ?? db.get<Material>("materials", ref.id), loadDiscussions(ref, uid)]);
      return m && m.isPublic !== false ? { ref, title: m.title, owned: m.uploaderId === uid, ds } : null;
    }
    const [o, ds] = await Promise.all([opps.find((x) => x.id === ref.id) ?? db.get<Opportunity>("opportunities", ref.id), loadDiscussions(ref, uid)]);
    return o ? { ref, title: o.title, owned: o.postedBy === uid, ds } : null;
  }));
  const seen = readSeen(uid);
  const toAnswer: DiscussionNotice[] = [];
  const oppToAnswer: DiscussionNotice[] = [];
  const answered: DiscussionNotice[] = [];
  for (const x of loaded) {
    if (!x) continue;
    const notice = (keys: string[]): DiscussionNotice => ({ parentId: x.ref.id, title: x.title, href: parentHref(x.ref), count: keys.length, keys });
    if (x.owned) {
      const keys = x.ds.filter((d) => d.authorId !== uid && d.answers.length === 0).map((d) => `q:${d.id}`).filter((k) => !seen.has(k));
      if (keys.length) (x.ref.kind === "material" ? toAnswer : oppToAnswer).push(notice(keys));
    }
    const replied = x.ds.filter((d) => d.authorId === uid)
      .map((d) => ({ d, n: d.answers.filter((a) => a.authorId !== uid).length }))
      .filter(({ d, n }) => n > 0 && !seen.has(`a:${d.id}:${n}`));
    if (replied.length) {
      const keys = replied.map(({ d, n }) => `a:${d.id}:${n}`);
      // Replies to "Cari tim" posts read as "dibalas"; a parent with both kinds keeps the neutral "dijawab".
      answered.push({ ...notice(keys), replied: replied.every(({ d }) => d.kind === "cari-tim") });
    }
  }
  return { toAnswer, oppToAnswer, answered };
}

// ---------- Jumlah diskusi di kartu peluang ----------

/** Discussions per opportunity (all, and "Cari tim"), for the cards on /opportunities. Raw counts, one query each. */
export async function opportunityDiscussionCounts(ids: string[]): Promise<Map<string, { all: number; team: number }>> {
  const lists = await Promise.all(ids.map((id) => db.list<Discussion>(DISCUSSIONS, [["opportunityId", "==", id]]).catch(() => [] as Discussion[])));
  return new Map(ids.map((id, i) => [id, { all: lists[i].length, team: lists[i].filter((d) => kindOf(d) === "cari-tim").length }]));
}
