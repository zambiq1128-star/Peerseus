"use client";
import { hiddenFromPeople, isLadderBotId, LADDER_BOTS } from "./bots";
import { callAi, newAiState, type Reply, type WaitInfo } from "./convert";
import type { CourseInfo } from "./curriculum";
import { loadCardStats } from "./materialStats";
import { db, newId, serverNow, serverTime } from "./db";
import { eloDelta, START_ELO } from "./elo";
import { ensureSeeded } from "./seed";
import type { Course, Duel, DuelSide, LiveSide, Material, MaterialType, Membership, Question, Quiz, UserProfile } from "./types";

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
    // Demo friends (Firebase) and ladder bots are not real people: never listed, ranked or recommended.
    return p && !hiddenFromPeople(p) ? [{ member: { ...m, name: p.name || m.name, major: p.major || m.major }, profile: p }] : [];
  });
}

export const courseMembers = async (courseId: string) => (await membersWithProfiles(courseId)).map((x) => x.member);

// ---------- Materials & quizzes ----------
/** Labels in display order. "paper" = past exam questions (soal ujian tahun lalu); "referensi" = paper ilmiah, contoh laporan, dsb. */
export const MATERIAL_TYPES: Record<MaterialType, string> = { materi: "Materi", catatan: "Catatan", paper: "Past paper", referensi: "Referensi" };
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

/** Newest public materials in these courses with what a card shows (home page). */
export async function latestMaterials(courseIds: string[], limit = 5): Promise<{ material: Material; quizSize?: number; discussions: number }[]> {
  // Two reads per course (materials) plus one stats read per course: the data layer only filters with == (a user has a handful of courses).
  const [materials, stats] = await Promise.all([
    Promise.all(courseIds.map((id) => db.list<Material>("materials", [["courseId", "==", id]]))),
    loadCardStats(courseIds),
  ]);
  const latest = materials.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
    .map((material) => ({ material, quizSize: stats.quizSize.get(material.id), discussions: stats.discussions.get(material.id) ?? 0 }));
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

export const DESCRIPTION_MAX = 120;
export const TOPIC_MAX = 30;

/**
 * Topics typed as "a, b, c". A new topic may have at most TOPIC_MAX characters; topics the material already has
 * (`existing`) are kept as they are, so editing an old material is never blocked by its old data.
 */
export function parseTopics(raw: string, existing: string[] = []): { topics: string[]; error?: string } {
  const topics = raw.split(",").map((t) => t.trim()).filter(Boolean);
  const tooLong = topics.find((t) => t.length > TOPIC_MAX && !existing.includes(t));
  return tooLong
    ? { topics, error: `Topik “${tooLong.slice(0, 20)}…” terlalu panjang (${tooLong.length} karakter). Tiap topik maksimal ${TOPIC_MAX} karakter; pisahkan dengan koma.` }
    : { topics };
}

export async function updateMaterial(m: Material, patch: Pick<Material, "title" | "type" | "topics" | "text" | "attachment" | "description"> & Partial<Pick<Material, "courseId">>) {
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

export const MOVE_BLOCKED = "Materi yang sudah punya kuis atau diskusi tidak bisa dipindah";

/**
 * What hangs on a material: its quiz (quizzes/quiz_{id}, any status) and how many discussions it has.
 * A material with either stays in its course (the quiz and discussions copy courseId); the edit page checks this,
 * the rules don't. Deleting shows the same numbers in its confirmation.
 */
export async function materialLinks(m: Material): Promise<{ hasQuiz: boolean; discussions: number }> {
  const [quiz, discussions] = await Promise.all([
    db.get<Quiz>("quizzes", `quiz_${m.id}`),
    db.list<{ id: string }>("discussions", [["materialId", "==", m.id]]),
  ]);
  return { hasQuiz: !!quiz, discussions: discussions.length };
}

/**
 * Deletes my material and its quiz. Duels (they copy the questions), discussions, proposals and practice
 * attempts stay: they belong to other people, and pages that show them skip a material that is gone.
 * Google Drive attachments are not removed.
 */
export async function deleteMaterial(m: Material) {
  await db.remove(colOf(m), m.id);
  if (m.isPublic !== false && (await db.get<Quiz>("quizzes", `quiz_${m.id}`))) await db.remove("quizzes", `quiz_${m.id}`);
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
export function shuffle<T>(a: T[]): T[] {
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

// ---------- Duel langsung: invites ----------
/** An invite nobody answers expires after 2 minutes. */
export const INVITE_TTL_MS = 2 * 60 * 1000;
/** Both players start together, this long after the invite was accepted (server time). */
export const DUEL_START_DELAY_MS = 5000;
// firestore.rules compare with the server's clock; wait a little past 2:00 so marking "expired" isn't refused.
const EXPIRE_SLACK_MS = 1500;

export const isLive = (d: Duel) => d.mode === "live";

/** Milliseconds left to answer an invite, by server time (0 when it's no longer waiting). */
export function inviteMsLeft(d: Duel, now = serverNow()) {
  if (d.status !== "invited" || d.invitedAt === undefined) return 0;
  return Math.max(0, d.invitedAt + INVITE_TTL_MS - now);
}
export const isActiveInvite = (d: Duel, now = serverNow()) => inviteMsLeft(d, now) > 0;

/** When the game starts (server time), once accepted: acceptedAt + 5 s. Computed, never stored. */
export const startAtOf = (d: Duel) => (d.acceptedAt === undefined ? null : d.acceptedAt + DUEL_START_DELAY_MS);

export type DuelState = Exclude<Duel["status"], "pending">;
/**
 * The duel's state for display: an invite past 2 minutes is "expired" even before someone marks it,
 * and an old turn-based duel that never finished ("pending") is "expired" too (no rating change).
 */
export function duelState(d: Duel, now = serverNow()): DuelState {
  if (d.status === "pending") return "expired";
  if (d.status === "invited" && !isActiveInvite(d, now)) return "expired";
  return d.status;
}

/** mm:ss for a countdown. */
export function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** My invite that is still waiting for an answer (a person has at most one). */
export async function activeOutgoingInvite(uid: string) {
  const ds = await db.list<Duel>("duels", [["challengerId", "==", uid], ["status", "==", "invited"]]);
  return ds.find((d) => isActiveInvite(d)) ?? null;
}

/** Sends an invite (or returns the one still waiting, since only one may be active). Returns the duel id. */
export async function createInvite(quiz: Quiz, me: UserProfile, opponent: Pick<Membership, "uid" | "name" | "isBot">) {
  // The rules compare opponentIsBot with users/{opponentId}.isBot, so a ladder bot's document must exist first.
  if (isLadderBotId(opponent.uid)) await ensureLadderBots();
  const waiting = await activeOutgoingInvite(me.id);
  if (waiting) return waiting.id;
  const id = newId("duel_");
  const duel: Duel = {
    id,
    mode: "live",
    courseId: quiz.courseId,
    quizId: quiz.id,
    quizTitle: quiz.title,
    challengerId: me.id,
    challengerName: me.name,
    opponentId: opponent.uid,
    opponentName: opponent.name,
    opponentIsBot: !!opponent.isBot,
    status: "invited",
    invitedAt: serverTime(),
    questions: shuffle(quiz.questions).slice(0, DUEL_QUESTIONS),
    participants: [me.id, opponent.uid],
    createdAt: Date.now(),
  };
  await db.set("duels", id, duel);
  return id;
}

/** Creates the five users/bot_* documents once (rules need them for opponentIsBot). Safe to call again. */
export async function ensureLadderBots() {
  await Promise.all(LADDER_BOTS.map(async (b) => {
    if ((await db.get<UserProfile>("users", b.id))?.isBot) return;
    const profile: UserProfile = { id: b.id, name: b.name, major: "", year: 1, bio: b.tagline, isPublic: false, isBot: true, courseIds: [], createdAt: Date.now() };
    await db.set("users", b.id, profile);
  }));
}

/** Ids of the ladder bots I have beaten in this course (from my duel history; no extra collection). */
export async function defeatedLadderBots(uid: string, courseId: string) {
  const won = (await myDuels(uid)).filter((d) => d.status === "completed" && d.courseId === courseId && d.winnerId === uid && isLadderBotId(d.opponentId));
  return new Set(won.map((d) => d.opponentId));
}

/** Why an invite can no longer be answered. */
function inviteGone(d: Duel | null) {
  if (!d) return "Duel tidak ditemukan";
  const state = duelState(d);
  if (state === "cancelled") return `${d.challengerName} membatalkan ajakan ini`;
  if (state === "declined") return "Ajakan ini sudah ditolak";
  if (state === "expired") return "Ajakan ini sudah kedaluwarsa";
  return "Ajakan ini sudah dijawab";
}

/** The opponent accepts (for a demo peer the challenger's browser accepts on its behalf). */
export async function acceptInvite(id: string, uid: string) {
  await db.transaction(async (tx) => {
    const d = await tx.get<Duel>("duels", id);
    if (!d || !isActiveInvite(d)) throw new Error(inviteGone(d));
    const forBot = d.opponentIsBot && d.challengerId === uid;
    if (d.opponentId !== uid && !forBot) throw new Error("Hanya lawan yang bisa menerima ajakan ini");
    tx.update("duels", id, { status: "ready", acceptedAt: serverTime() });
  });
}

/** The opponent can decline an invite that is still waiting. Demo peers never decline. */
export function canDecline(d: Duel, uid: string) {
  return isLive(d) && isActiveInvite(d) && d.opponentId === uid && !d.opponentIsBot;
}

/** Declines an invite: the duel ends as "declined" and nobody's rating changes. */
export async function declineDuel(id: string, uid: string) {
  await db.transaction(async (tx) => {
    const d = await tx.get<Duel>("duels", id);
    if (!d || !canDecline(d, uid)) throw new Error(d && d.opponentId === uid ? inviteGone(d) : "Duel ini sudah tidak bisa ditolak");
    tx.update("duels", id, { status: "declined", declinedAt: serverTime() });
  });
}

/** The challenger withdraws an invite nobody has answered yet. */
export async function cancelInvite(id: string, uid: string) {
  await db.transaction(async (tx) => {
    const d = await tx.get<Duel>("duels", id);
    if (!d || d.challengerId !== uid) throw new Error("Hanya penantang yang bisa membatalkan ajakan");
    if (d.status !== "invited") throw new Error(inviteGone(d));
    tx.update("duels", id, { status: "cancelled", cancelledAt: serverTime() });
  });
}

/** Marks an unanswered invite past 2 minutes as expired (either player may). Quietly does nothing otherwise. */
export async function expireInvite(id: string) {
  await db
    .transaction(async (tx) => {
      const d = await tx.get<Duel>("duels", id);
      if (!d || d.status !== "invited" || d.invitedAt === undefined) return;
      if (serverNow() < d.invitedAt + INVITE_TTL_MS + EXPIRE_SLACK_MS) return;
      tx.update("duels", id, { status: "expired", expiredAt: serverTime() });
    })
    .catch(() => undefined);
}

// ---------- Duel langsung: playing and the result ----------
export const QUESTION_MS = SECONDS_PER_QUESTION * 1000;
/** Each player writes lastSeen this often while the duel runs. */
export const HEARTBEAT_MS = 10_000;
/** No write for this long = the player left: their remaining questions count as wrong. */
export const LEFT_AFTER_MS = 30_000;
/** Extra time after the last question's 20 s before the duel is over for everyone. */
export const END_GRACE_MS = 5_000;
// firestore.rules check the same limits with the server's clock; act a little later so the write isn't refused.
const RULES_SLACK_MS = 1_500;

export type Role = "challenger" | "opponent";
export const roleOf = (d: Duel, uid: string): Role | null => (d.challengerId === uid ? "challenger" : d.opponentId === uid ? "opponent" : null);
export const liveOf = (d: Duel, role: Role) => (role === "challenger" ? d.challengerLive : d.opponentLive);
export const other = (role: Role): Role => (role === "challenger" ? "opponent" : "challenger");

/** Server time after which nobody can still be answering: startAt + 20 s per question + a short grace. */
export function deadlineOf(d: Duel) {
  const s = startAtOf(d);
  return s === null ? null : s + d.questions.length * QUESTION_MS + END_GRACE_MS;
}

const answered = (side?: LiveSide) => side?.answers?.length ?? 0; // a heartbeat alone has no answers yet

/** Why the duel can be settled now, or null while someone is still playing. */
export function endReason(d: Duel, now = serverNow()): Duel["endReason"] | null {
  if (d.status !== "ready" && d.status !== "playing") return null;
  const n = d.questions.length;
  const c = d.challengerLive, o = d.opponentLive;
  if (answered(c) >= n && answered(o) >= n) return "done";
  if (now > (deadlineOf(d) ?? Infinity) + RULES_SLACK_MS) return "timeout";
  const over = (side?: LiveSide) => answered(side) >= n || now > (side?.lastSeen ?? d.acceptedAt ?? 0) + LEFT_AFTER_MS + RULES_SLACK_MS;
  return over(c) && over(o) ? "left" : null;
}

/** Saves my answers so far (also the opponent's progress "soal 4/6"); the first write moves the duel to "playing". */
export async function saveLiveSide(d: Duel, role: Role, answers: number[], timesMs: number[]) {
  const side: LiveSide = { answers, timesMs, lastSeen: serverTime() };
  await db.update("duels", d.id, { [`${role}Live`]: side, ...(d.status === "ready" && { status: "playing" }) });
}

/** "Still here": only lastSeen changes. */
export async function heartbeat(d: Duel, role: Role) {
  await db.update("duels", d.id, { [`${role}Live.lastSeen`]: serverTime(), ...(d.status === "ready" && { status: "playing" }) });
}

function finalSide(questions: Question[], side?: LiveSide): DuelSide {
  // Questions never answered (left or out of time) count as wrong, with the full 20 s.
  const answers = questions.map((_, i) => side?.answers?.[i] ?? -1);
  const timesMs = questions.map((_, i) => side?.timesMs?.[i] ?? QUESTION_MS);
  return {
    answers,
    timesMs,
    score: questions.reduce((s, q, i) => s + (answers[i] === q.answerIndex ? 1 : 0), 0),
    totalMs: timesMs.reduce((a, b) => a + b, 0),
    finishedAt: Date.now(),
  };
}

/** Higher score wins; equal score → faster total time wins (by more than 0.5 s); otherwise a draw. 1 = challenger wins. */
export function duelResult(c: DuelSide, o: DuelSide): 1 | 0.5 | 0 {
  if (c.score !== o.score) return c.score > o.score ? 1 : 0;
  if (Math.abs(c.totalMs - o.totalMs) > 500) return c.totalMs < o.totalMs ? 1 : 0;
  return 0.5;
}

/**
 * Display only: a finished duel with equal scores that still has a winner was decided by time
 * (same rule as duelResult: the difference is more than 0.5 s). Returns both total times, or null.
 */
export function decidedByTime(d: Duel): { challengerMs: number; opponentMs: number } | null {
  if (d.status !== "completed" || !d.challenger || !d.opponent || !d.winnerId) return null;
  if (d.challenger.score !== d.opponent.score) return null;
  if (Math.abs(d.challenger.totalMs - d.opponent.totalMs) <= 500) return null;
  return { challengerMs: d.challenger.totalMs, opponentMs: d.opponent.totalMs };
}

function withTopicStats(m: Membership, questions: Question[], answers: number[]) {
  const stats = { ...m.topicStats };
  questions.forEach((q, i) => {
    const s = stats[q.topic] ?? { correct: 0, total: 0 };
    stats[q.topic] = { correct: s.correct + (answers[i] === q.answerIndex ? 1 : 0), total: s.total + 1 };
  });
  return stats;
}

/**
 * Ends the duel once (both finished, time is up, or a player left): one transaction writes both final sides,
 * the winner, eloChange and both memberships. A duel that is already "completed" is left alone, so the
 * rating can never change twice, whoever calls this and however often. Against a demo peer nobody's rating
 * or win count changes; the human's topicStats still do.
 */
export async function settleDuel(id: string) {
  return db.transaction(async (tx) => {
    const d = await tx.get<Duel>("duels", id);
    if (!d) return null;
    const reason = endReason(d);
    if (!reason) return d;
    const mc = await tx.get<Membership>("memberships", `${d.courseId}_${d.challengerId}`);
    const mo = await tx.get<Membership>("memberships", `${d.courseId}_${d.opponentId}`);
    const c = finalSide(d.questions, d.challengerLive);
    const o = finalSide(d.questions, d.opponentLive);
    const result = duelResult(c, o);
    const bot = !!d.opponentIsBot;
    const [dc, dO] = bot ? [0, 0] : eloDelta(mc?.elo ?? START_ELO, mo?.elo ?? START_ELO, result);
    const patch = {
      challenger: c,
      opponent: o,
      status: "completed" as const,
      winnerId: result === 1 ? d.challengerId : result === 0 ? d.opponentId : null,
      eloChange: { challenger: dc, opponent: dO },
      completedAt: serverTime(),
      endReason: reason,
    };
    const apply = (m: Membership | null, side: DuelSide, delta: number, r: 1 | 0.5 | 0) => {
      if (!m || m.isBot) return;
      tx.update("memberships", m.id, {
        topicStats: withTopicStats(m, d.questions, side.answers),
        ...(!bot && {
          elo: m.elo + delta,
          wins: m.wins + (r === 1 ? 1 : 0),
          losses: m.losses + (r === 0 ? 1 : 0),
          draws: m.draws + (r === 0.5 ? 1 : 0),
        }),
      });
    };
    tx.update("duels", id, patch);
    apply(mc, c, dc, result);
    apply(mo, o, dO, (1 - result) as 1 | 0.5 | 0);
    return { ...d, ...patch, completedAt: Date.now() } as Duel;
  });
}

/** How a demo peer answers question q: right with its topic accuracy, after 4–15 s like a person. */
export function botAnswer(bot: Membership, q: Question) {
  const st = bot.topicStats[q.topic];
  const p = st && st.total ? st.correct / st.total : 0.5 + (bot.elo - 1000) / 800;
  const correct = Math.random() < Math.min(0.95, Math.max(0.15, p));
  const answer = correct ? q.answerIndex : (q.answerIndex + 1 + Math.floor(Math.random() * 3)) % q.options.length;
  return { answer, ms: Math.round(4000 + Math.random() * 11000) };
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
export type PartnerRec = { member: Membership; profile: UserProfile | null; score: number; reasons: string[];
  /** True when this candidate has accuracy data for at least one of the topics to strengthen (so the pick is by topic, not just level). */
  byTopic: boolean };

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
    recs.push({ member: m, profile, score: 0.6 * complement + 0.3 * eloSim + 0.1 * sameMajor, reasons, byTopic: strengths.length > 0 });
  }
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}
