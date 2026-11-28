import { db, type Filter } from "./db";
import type { Discussion, Quiz } from "./types";

/** What a material card shows besides the material itself. Counted in the app, never stored. */
export type CardStats = {
  /** Material id -> number of discussions (questions) on it. Opportunity discussions are not counted. */
  discussions: Map<string, number>;
  /** Material id -> number of questions of its published quiz. Drafts and missing quizzes have no entry. */
  quizSize: Map<string, number>;
};

export const noStats = (): CardStats => ({ discussions: new Map(), quizSize: new Map() });

/** Discussions per material from a list of discussions (opportunity discussions have no materialId and are skipped). */
export function countDiscussions(list: Pick<Discussion, "materialId">[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const d of list) if (d.materialId) n.set(d.materialId, (n.get(d.materialId) ?? 0) + 1);
  return n;
}

/** Question count of every published quiz, by material id. */
export function publishedQuizSizes(quizzes: Pick<Quiz, "materialId" | "status" | "questions">[]): Map<string, number> {
  return new Map(quizzes.filter((q) => q.status === "published").map((q) => [q.materialId, q.questions.length]));
}

/**
 * Stats for many cards with a fixed number of queries, never one per card. The data layer only filters with ==,
 * so this reads discussions and quizzes once per course (`courseIds`), or once in total when `courseIds` is
 * omitted (Jelajah shows every course). Discussions carry courseId only on materials, so opportunities drop out.
 */
export async function loadCardStats(courseIds?: string[]): Promise<CardStats> {
  const scopes: (Filter[] | undefined)[] = courseIds ? courseIds.map((id) => [["courseId", "==", id] as Filter]) : [undefined];
  const parts = await Promise.all(
    scopes.map(async (where) => {
      const [discussions, quizzes] = await Promise.all([db.list<Discussion>("discussions", where), db.list<Quiz>("quizzes", where)]);
      return { discussions, quizzes };
    }),
  );
  return {
    discussions: countDiscussions(parts.flatMap((p) => p.discussions)),
    quizSize: publishedQuizSizes(parts.flatMap((p) => p.quizzes)),
  };
}
