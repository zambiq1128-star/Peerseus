"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { discussionHref, questionDiscussionCounts } from "@/lib/discussions";
import type { Quiz } from "@/lib/types";
import { useAsync } from "./ui";

/** Discussion counts per question of a quiz's material. null while loading, or when the material has no Diskusi (private). */
export function useQuestionDiscussions(quizId: string) {
  const uid = useAuth().profile!.id;
  const { data } = useAsync(async () => {
    const quiz = await db.get<Quiz>("quizzes", quizId);
    const counts = quiz ? await questionDiscussionCounts(quiz.materialId, uid) : null;
    return quiz && counts ? { materialId: quiz.materialId, counts } : null;
  }, [quizId, uid]);
  // A failed load just hides the links: the review itself still works.
  return data ?? null;
}

/** "Bahas soal ini", or "Lihat diskusi (N)" when the question already has some. Hidden when the quiz has no Diskusi. */
export function DiscussLink({ info, questionId }: { info: ReturnType<typeof useQuestionDiscussions>; questionId: string }) {
  if (!info) return null;
  const n = info.counts.get(questionId) ?? 0;
  return (
    <div className="mt-1">
      <Link href={discussionHref(info.materialId, questionId)} className="link text-xs">
        {n > 0 ? `Lihat diskusi (${n})` : "Bahas soal ini"}
      </Link>
    </div>
  );
}
