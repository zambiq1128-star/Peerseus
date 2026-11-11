"use client";
import { callAi, newAiState, type Reply, type WaitInfo } from "./convert";
import { db, newId } from "./db";
import { eloDelta, START_ELO } from "./elo";
import type { Duel, DuelSide, Material, Membership, Question, Quiz, UserProfile } from "./types";

export const DUEL_QUESTIONS = 6;
export const SECONDS_PER_QUESTION = 20;

// ---------- Courses ----------
export async function joinCourse(profile: UserProfile, courseId: string) {
  const id = `${courseId}_${profile.id}`;
  const existing = await db.get<Membership>("memberships", id);
  if (!existing) {
    const m: Membership = { id, courseId, uid: profile.id, name: profile.name, major: profile.major, elo: START_ELO, wins: 0, losses: 0, draws: 0, topicStats: {} };
    await db.set("memberships", id, m);
  }
  if (!profile.courseIds.includes(courseId)) {
    await db.update("users", profile.id, { courseIds: [...profile.courseIds, courseId] });
  }
}

export const getMembership = (courseId: string, uid: string) => db.get<Membership>("memberships", `${courseId}_${uid}`);
export const courseMembers = (courseId: string) => db.list<Membership>("memberships", [["courseId", "==", courseId]]);

// ---------- Materials & quizzes ----------
/** Files are processed in the browser; only the resulting text is stored (no Firebase Storage). */
export async function createMaterial(input: Omit<Material, "id" | "createdAt" | "reports">) {
  const m: Material = { ...input, id: newId("mat_"), createdAt: Date.now(), reports: 0 };
  await db.set("materials", m.id, m);
  return m;
}

export async function updateMaterial(id: string, patch: Pick<Material, "title" | "topics" | "text">) {
  await db.update("materials", id, { ...patch, format: "markdown", updatedAt: Date.now() });
}

/** Asks the server for questions; waits and retries by itself on rate limits (see callAi). */
export async function generateQuiz(material: Material, uid: string, count = 8, onWait?: (w: WaitInfo) => void): Promise<Quiz> {
  const data = await callAi<Reply & { questions?: Question[]; generator?: Quiz["generator"] }>(
    "/api/generate-quiz",
    { title: material.title, topics: material.topics, text: material.text, fileUrl: material.fileUrl, mimeType: material.mimeType, count },
    newAiState(),
    onWait,
  );
  if (!data.questions?.length) throw new Error("Gagal membuat kuis");
  const quiz: Quiz = {
    id: `quiz_${material.id}`,
    materialId: material.id,
    courseId: material.courseId,
    title: material.title,
    status: "draft",
    questions: data.questions as Question[],
    createdBy: uid,
    createdAt: Date.now(),
    generator: data.generator ?? "gemini",
    reports: 0,
  };
  await db.set("quizzes", quiz.id, quiz);
  return quiz;
}

// ---------- Duels ----------
function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Opponents in the same course, closest Elo first. */
export async function suggestOpponents(courseId: string, uid: string) {
  const me = await getMembership(courseId, uid);
  const all = (await courseMembers(courseId)).filter((m) => m.uid !== uid);
  const myElo = me?.elo ?? START_ELO;
  return all.sort((a, b) => Math.abs(a.elo - myElo) - Math.abs(b.elo - myElo));
}

export async function createDuel(quiz: Quiz, me: UserProfile, opponent: Membership) {
  const id = newId("duel_");
  const duel: Duel = {
    id,
    courseId: quiz.courseId,
    quizId: quiz.id,
    quizTitle: quiz.title,
    challengerId: me.id,
    challengerName: me.name,
    opponentId: opponent.uid,
    opponentName: opponent.name,
    opponentIsBot: !!opponent.isBot,
    status: "pending",
    questions: shuffle(quiz.questions).slice(0, DUEL_QUESTIONS),
    participants: [me.id, opponent.uid],
    createdAt: Date.now(),
  };
  await db.set("duels", id, duel);
  return duel;
}

function scoreSide(questions: Question[], answers: number[], timesMs: number[]): DuelSide {
  return {
    answers,
    timesMs,
    score: questions.reduce((s, q, i) => s + (answers[i] === q.answerIndex ? 1 : 0), 0),
    totalMs: timesMs.reduce((a, b) => a + b, 0),
    finishedAt: Date.now(),
  };
}

/** Demo peers answer based on their topic accuracy. */
function simulateBot(duel: Duel, bot: Membership): DuelSide {
  const answers: number[] = [];
  const times: number[] = [];
  for (const q of duel.questions) {
    const st = bot.topicStats[q.topic];
    const p = st && st.total ? st.correct / st.total : 0.5 + (bot.elo - 1000) / 800;
    const correct = Math.random() < Math.min(0.95, Math.max(0.15, p));
    answers.push(correct ? q.answerIndex : (q.answerIndex + 1 + Math.floor(Math.random() * 3)) % q.options.length);
    times.push(Math.round(4000 + Math.random() * 11000));
  }
  return scoreSide(duel.questions, answers, times);
}

async function addTopicStats(courseId: string, uid: string, questions: Question[], answers: number[]) {
  const m = await getMembership(courseId, uid);
  if (!m || m.isBot) return;
  const stats = { ...m.topicStats };
  questions.forEach((q, i) => {
    const s = stats[q.topic] ?? { correct: 0, total: 0 };
    stats[q.topic] = { correct: s.correct + (answers[i] === q.answerIndex ? 1 : 0), total: s.total + 1 };
  });
  await db.update("memberships", m.id, { topicStats: stats });
}

export async function submitDuel(duelId: string, uid: string, answers: number[], timesMs: number[]) {
  const duel = await db.get<Duel>("duels", duelId);
  if (!duel) throw new Error("Duel tidak ditemukan");
  const role = duel.challengerId === uid ? "challenger" : duel.opponentId === uid ? "opponent" : null;
  if (!role) throw new Error("Kamu bukan peserta duel ini");
  if (duel[role]) return duel;

  duel[role] = scoreSide(duel.questions, answers, timesMs);
  await addTopicStats(duel.courseId, uid, duel.questions, answers);

  if (role === "challenger" && duel.opponentIsBot) {
    const bot = await getMembership(duel.courseId, duel.opponentId);
    if (bot) duel.opponent = simulateBot(duel, bot);
  }

  if (duel.challenger && duel.opponent) await finalize(duel);
  else await db.set("duels", duel.id, duel);
  return duel;
}

async function finalize(duel: Duel) {
  const c = duel.challenger!, o = duel.opponent!;
  // Higher score wins; equal score → faster total time wins; equal both → draw.
  let result: 1 | 0.5 | 0 = 0.5;
  if (c.score !== o.score) result = c.score > o.score ? 1 : 0;
  else if (Math.abs(c.totalMs - o.totalMs) > 500) result = c.totalMs < o.totalMs ? 1 : 0;

  const mc = await getMembership(duel.courseId, duel.challengerId);
  const mo = await getMembership(duel.courseId, duel.opponentId);
  const [dc, dO] = eloDelta(mc?.elo ?? START_ELO, mo?.elo ?? START_ELO, result);
  const bump = (m: Membership | null, d: number, r: 1 | 0.5 | 0) =>
    m &&
    db.update("memberships", m.id, {
      elo: m.elo + d,
      wins: m.wins + (r === 1 ? 1 : 0),
      losses: m.losses + (r === 0 ? 1 : 0),
      draws: m.draws + (r === 0.5 ? 1 : 0),
    });
  await bump(mc, dc, result);
  await bump(mo, dO, (1 - result) as 1 | 0.5 | 0);

  duel.status = "completed";
  duel.winnerId = result === 1 ? duel.challengerId : result === 0 ? duel.opponentId : null;
  duel.eloChange = { challenger: dc, opponent: dO };
  await db.set("duels", duel.id, duel);
}

export async function myDuels(uid: string) {
  const ds = await db.list<Duel>("duels", [["participants", "array-contains", uid]]);
  return ds.sort((a, b) => b.createdAt - a.createdAt);
}

export function missedTopics(duel: Duel, uid: string) {
  const side = duel.challengerId === uid ? duel.challenger : duel.opponent;
  if (!side) return [];
  const miss: Record<string, number> = {};
  duel.questions.forEach((q, i) => {
    if (side.answers[i] !== q.answerIndex) miss[q.topic] = (miss[q.topic] ?? 0) + 1;
  });
  return Object.entries(miss).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// ---------- Study partner recommendation ----------
export type PartnerRec = { member: Membership; profile: UserProfile | null; score: number; reasons: string[] };

const acc = (m: Membership, t: string) => {
  const s = m.topicStats[t];
  return s && s.total ? s.correct / s.total : null;
};

export function weakTopicsOf(m: Membership | null, threshold = 0.6) {
  if (!m) return [];
  return Object.entries(m.topicStats)
    .filter(([, s]) => s.total > 0 && s.correct / s.total < threshold)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
    .map(([t]) => t);
}

/**
 * Score = 0.6 × how strong they are in my weak topics
 *       + 0.3 × Elo closeness (similar level → comfortable to study together)
 *       + 0.1 × same major.
 */
export async function recommendPartners(courseId: string, uid: string, focusTopics?: string[], limit = 5): Promise<PartnerRec[]> {
  const me = await getMembership(courseId, uid);
  const myProfile = await db.get<UserProfile>("users", uid);
  const weak = focusTopics?.length ? focusTopics : weakTopicsOf(me);
  const others = (await courseMembers(courseId)).filter((m) => m.uid !== uid);
  const recs: PartnerRec[] = [];
  for (const m of others) {
    const profile = await db.get<UserProfile>("users", m.uid);
    if (profile && !profile.isPublic) continue;
    const reasons: string[] = [];
    const strengths = weak.map((t) => [t, acc(m, t)] as const).filter(([, a]) => a !== null) as [string, number][];
    const complement = strengths.length ? strengths.reduce((s, [, a]) => s + a, 0) / weak.length : 0.4;
    strengths.filter(([, a]) => a >= 0.75).forEach(([t, a]) => reasons.push(`Kuat di ${t} (${Math.round(a * 100)}%)`));
    const diff = Math.abs(m.elo - (me?.elo ?? START_ELO));
    const eloSim = 1 - Math.min(diff / 400, 1);
    if (diff <= 100) reasons.push("Level mirip");
    const sameMajor = myProfile?.major && myProfile.major === m.major ? 1 : 0;
    if (sameMajor) reasons.push(`Sama-sama ${m.major}`);
    recs.push({ member: m, profile, score: 0.6 * complement + 0.3 * eloSim + 0.1 * sameMajor, reasons });
  }
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}
