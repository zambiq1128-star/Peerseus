"use client";
import { callAi, newAiState, type Reply, type WaitInfo } from "./convert";
import type { CourseInfo } from "./curriculum";
import { db, newId } from "./db";
import { eloDelta, START_ELO } from "./elo";
import { ensureSeeded } from "./seed";
import type { Course, Duel, DuelSide, Material, MaterialType, Membership, Question, Quiz, UserProfile } from "./types";

export const DUEL_QUESTIONS = 6;
export const SECONDS_PER_QUESTION = 20;

// ---------- Courses ----------
export const COURSES_PAGE = "/courses";

/**
 * New users pick their courses right after their personal data. Users from before the Mata Kuliah page
 * who already joined courses aren't sent there.
 */
export const needsCourses = (p: UserProfile) => !p.isBot && p.semester === undefined && p.courseIds.length === 0;

function newMembership(user: Pick<UserProfile, "id" | "name" | "major">, courseId: string): Membership {
  return { id: `${courseId}_${user.id}`, courseId, uid: user.id, name: user.name, major: user.major, elo: START_ELO, wins: 0, losses: 0, draws: 0, topicStats: {} };
}

/** Creates the membership, or brings back one the user left (keeping its rating). */
async function activateMembership(user: Pick<UserProfile, "id" | "name" | "major">, courseId: string) {
  const existing = await db.get<Membership>("memberships", `${courseId}_${user.id}`);
  if (!existing) await db.set("memberships", `${courseId}_${user.id}`, newMembership(user, courseId));
  else if (existing.left) await db.update("memberships", existing.id, { left: false });
}

export async function joinCourse(profile: UserProfile, courseId: string) {
  await activateMembership(profile, courseId);
  if (!profile.courseIds.includes(courseId)) {
    await db.update("users", profile.id, { courseIds: [...profile.courseIds, courseId] });
  }
}

/**
 * Applies the list from the Mata Kuliah page: creates courses missing from the catalog (matched by code),
 * joins the picked ones and leaves the rest. Returns the course ids; the caller saves them in the profile.
 */
export async function setMyCourses(profile: UserProfile, picked: CourseInfo[]): Promise<string[]> {
  await ensureSeeded();
  const byCode = new Map((await db.list<Course>("courses")).map((c) => [c.code, c]));
  const ids: string[] = [];
  for (const info of picked) {
    let course = byCode.get(info.code);
    if (!course) {
      course = { id: courseIdFor(info.code), code: info.code, name: info.name, description: info.sks ? `Kurikulum ITB 2024 · ${info.sks} SKS` : "Ditambahkan mahasiswa", sks: info.sks };
      await db.set("courses", course.id, course);
      byCode.set(course.code, course);
    }
    await activateMembership(profile, course.id);
    if (!ids.includes(course.id)) ids.push(course.id);
  }
  for (const id of profile.courseIds.filter((c) => !ids.includes(c))) {
    if (await db.get<Membership>("memberships", `${id}_${profile.id}`)) await db.update("memberships", `${id}_${profile.id}`, { left: true });
  }
  return ids;
}

/** Document id for a new course code, e.g. "IF2110" → "if2110". Codes are letters and digits. */
const courseIdFor = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export const getMembership = (courseId: string, uid: string) => db.get<Membership>("memberships", `${courseId}_${uid}`);
/**
 * Current members (not the ones who removed the course), each with their user document.
 * A membership keeps a copy of the name and faculty from when the course was joined, so both are
 * taken from the profile instead, which follows renames. Members whose user document is gone
 * (deleted in the console) are left out; signing in again brings them back with their rating.
 */
async function membersWithProfiles(courseId: string): Promise<{ member: Membership; profile: UserProfile }[]> {
  const members = (await db.list<Membership>("memberships", [["courseId", "==", courseId]])).filter((m) => !m.left);
  const profiles = await Promise.all(members.map((m) => db.get<UserProfile>("users", m.uid)));
  return members.flatMap((m, i) => {
    const p = profiles[i];
    return p ? [{ member: { ...m, name: p.name || m.name, major: p.major || m.major }, profile: p }] : [];
  });
}

export const courseMembers = async (courseId: string) => (await membersWithProfiles(courseId)).map((x) => x.member);

// ---------- Materials & quizzes ----------
/** Labels in display order. "paper" = past exam questions (soal ujian tahun lalu). */
export const MATERIAL_TYPES: Record<MaterialType, string> = { materi: "Materi", catatan: "Catatan", paper: "Past paper" };
export const materialType = (m: Pick<Material, "type">): MaterialType => m.type ?? "materi";

/**
 * Private materials (Materiku) live in their own collection, which only the uploader can read
 * (firestore.rules), so every existing `materials` query stays public-only and old materials need no migration.
 * Making a material public or private moves it between the two collections, keeping its id.
 */
export const PRIVATE_MATERIALS = "privateMaterials";
const colOf = (m: Pick<Material, "isPublic">) => (m.isPublic === false ? PRIVATE_MATERIALS : "materials");

/** A public material, or one of my private ones. Others get null for a private material. */
export async function getMaterial(id: string): Promise<Material | null> {
  const m = await db.get<Material>("materials", id);
  if (m) return m;
  try {
    return await db.get<Material>(PRIVATE_MATERIALS, id);
  } catch {
    return null; // someone else's private material: the rules refuse the read
  }
}

/**
 * A material keeps a copy of the uploader's name from upload time. Show the current name from
 * users/{id} instead, so renames carry over (same as courseMembers). One read per distinct uploader;
 * the stored name stays as a fallback when the user document is gone.
 */
export async function withUploaderNames<T extends Pick<Material, "uploaderId" | "uploaderName">>(materials: T[]): Promise<T[]> {
  const ids = [...new Set(materials.map((m) => m.uploaderId))];
  const users = await Promise.all(ids.map((id) => db.get<UserProfile>("users", id).catch(() => null)));
  const names = new Map(ids.map((id, i) => [id, users[i]?.name]));
  return materials.map((m) => ({ ...m, uploaderName: names.get(m.uploaderId) || m.uploaderName }));
}

/** Everything I uploaded, public and private, newest first. */
export async function myMaterials(uid: string): Promise<Material[]> {
  const [pub, priv] = await Promise.all([
    db.list<Material>("materials", [["uploaderId", "==", uid]]),
    db.list<Material>(PRIVATE_MATERIALS, [["uploaderId", "==", uid]]),
  ]);
  return [...pub, ...priv].sort((a, b) => b.createdAt - a.createdAt);
}

/** Newest public materials in these courses, each with whether its quiz is ready for duels (home page). */
export async function latestMaterials(courseIds: string[], limit = 5): Promise<{ material: Material; quizReady: boolean }[]> {
  // One query per course: the data layer only filters with == (a user has a handful of courses).
  const perCourse = await Promise.all(
    courseIds.map(async (id) => {
      const [materials, quizzes] = await Promise.all([
        db.list<Material>("materials", [["courseId", "==", id]]),
        db.list<Quiz>("quizzes", [["courseId", "==", id]]),
      ]);
      const ready = new Set(quizzes.filter((q) => q.status === "published").map((q) => q.materialId));
      return materials.map((material) => ({ material, quizReady: ready.has(material.id) }));
    }),
  );
  const latest = perCourse.flat().sort((a, b) => b.material.createdAt - a.material.createdAt).slice(0, limit);
  const named = await withUploaderNames(latest.map((x) => x.material));
  return latest.map((x, i) => ({ ...x, material: named[i] }));
}

/** Files are processed in the browser into text (no Firebase Storage); an original file can go along as an attachment in Google Drive. */
export async function createMaterial(input: Omit<Material, "id" | "createdAt" | "reports">) {
  const m: Material = { ...input, id: newId("mat_"), createdAt: Date.now(), reports: 0 };
  if (m.isPublic !== false) delete m.isPublic;
  if (!m.attachment) delete m.attachment;
  await db.set(colOf(m), m.id, m);
  return m;
}

export async function updateMaterial(m: Material, patch: Pick<Material, "title" | "type" | "topics" | "text" | "attachment">) {
  await db.update(colOf(m), m.id, { ...patch, format: "markdown", updatedAt: Date.now() });
}

export const PRIVATE_WITH_QUIZ = "Materi yang sudah punya kuis tidak bisa dijadikan privat, karena kuisnya dipakai untuk duel.";

/** Moves a material between public and private. A material with a quiz stays public (its quiz is used in duels). */
export async function setMaterialPublic(m: Material, isPublic: boolean): Promise<Material> {
  if ((m.isPublic !== false) === isPublic) return m;
  if (!isPublic && (await db.get<Quiz>("quizzes", `quiz_${m.id}`))) throw new Error(PRIVATE_WITH_QUIZ);
  const next: Material = { ...m, isPublic: isPublic ? undefined : false, updatedAt: Date.now() };
  await db.set(colOf(next), m.id, next);
  await db.remove(colOf(m), m.id);
  return next;
}

/** Asks the server for questions; waits and retries by itself on rate limits (see callAi). */
export async function generateQuiz(material: Material, uid: string, count = 8, onWait?: (w: WaitInfo) => void): Promise<Quiz> {
  if (material.isPublic === false) throw new Error("Kuis hanya bisa dibuat dari materi publik.");
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
  const others = (await membersWithProfiles(courseId)).filter((x) => x.member.uid !== uid);
  const recs: PartnerRec[] = [];
  for (const { member: m, profile } of others) {
    if (!profile.isPublic) continue;
    const reasons: string[] = [];
    const strengths = weak.map((t) => [t, acc(m, t)] as const).filter(([, a]) => a !== null) as [string, number][];
    const complement = strengths.length ? strengths.reduce((s, [, a]) => s + a, 0) / weak.length : 0.4;
    strengths.filter(([, a]) => a >= 0.75).forEach(([t, a]) => reasons.push(`Kuat di ${t} (${Math.round(a * 100)}%)`));
    const diff = Math.abs(m.elo - (me?.elo ?? START_ELO));
    const eloSim = 1 - Math.min(diff / 400, 1);
    if (diff <= 100) reasons.push("Level mirip");
    const sameMajor = myProfile?.major && myProfile.major === m.major ? 1 : 0;
    const myProgram = myProfile?.program || myProfile?.dreamProgram;
    if (myProgram && myProgram === (profile?.program || profile?.dreamProgram)) {
      reasons.push(profile?.program && myProfile?.program ? `Sama-sama ${myProgram}` : `Sama-sama incar ${myProgram}`);
    } else if (sameMajor) reasons.push(`Sama-sama ${m.major}`);
    recs.push({ member: m, profile, score: 0.6 * complement + 0.3 * eloSim + 0.1 * sameMajor, reasons });
  }
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}
