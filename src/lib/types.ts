export type UserProfile = {
  id: string;
  name: string;
  /** Faculty/school code (STEI, FTI, ...), not the study program. */
  major: string;
  /** "tpb" = first year, no study program yet. Missing on profiles made before this field. */
  stage?: "tpb" | "jurusan";
  /** Confirmed study program (jurusan), e.g. "Teknik Kimia". */
  program?: string;
  /** TPB students: the program they hope to get into. Never set together with `program`. */
  dreamProgram?: string;
  /** Semester picked on the Mata Kuliah page (1 = first semester). Missing until that page is saved once. */
  semester?: number;
  /** Angkatan (intake year), prefilled from the NIM and editable. `year` below is older and unused. */
  entryYear?: number;
  year: number;
  bio?: string;
  contact?: string;
  isPublic: boolean;
  /** What other people may read. Missing switch = shown. Hidden fields live in users/{uid}/private/profile (src/lib/privacy.ts). */
  privacy?: Privacy;
  /** Set by the app at sign-in: true for ITB accounts, false for guests. firestore.rules check it matches the token. */
  isItbVerified?: boolean;
  isBot?: boolean;
  courseIds: string[];
  createdAt: number;
};

/** Per-item visibility. showProgram covers `program` and `dreamProgram`. */
export type Privacy = { showProgram?: boolean; showEntryYear?: boolean; showContact?: boolean };

export type Course = {
  id: string;
  code: string;
  name: string;
  description: string;
  sks?: number;
};

export type TopicStat = { correct: number; total: number };

/** One user's standing in one course. Document id: `${courseId}_${uid}` */
export type Membership = {
  id: string;
  courseId: string;
  uid: string;
  name: string;
  major: string;
  isBot?: boolean;
  /** Removed the course from their list. Kept (not deleted) so the rating is back if they add it again. */
  left?: boolean;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  topicStats: Record<string, TopicStat>;
};

/**
 * Kind of material. Missing on materials from before this field: treat as "materi" (see materialType).
 * "paper" = past exam questions; "referensi" = reading material such as scientific papers or example reports.
 */
export type MaterialType = "materi" | "catatan" | "paper" | "referensi";

export type Material = {
  id: string;
  courseId: string;
  title: string;
  type?: MaterialType;
  /** false = private: stored in privateMaterials, only the uploader can read it (src/lib/peerseus.ts). Missing = public. */
  isPublic?: boolean;
  description: string;
  topics: string[];
  text: string;
  /** "markdown" = Markdown + LaTeX (rendered with KaTeX). Missing = old plain-text material. */
  format?: "markdown";
  /** Old materials only: a link to download the original file. New files go in `attachment`. */
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  /** Original PDF or image in the team's Google Drive (public materials only). null = removed. */
  attachment?: Attachment | null;
  uploaderId: string;
  uploaderName: string;
  createdAt: number;
  updatedAt?: number;
  reports: number;
};

/**
 * A file in Google Drive. Public materials: a file in the team's folder, shared "anyone with the link can view"
 * (src/lib/drive.ts). Private materials: `ownDrive` = a link the uploader pasted to a file in their own Drive,
 * left "Restricted" so only they can open it (name, mimeType and size unknown: "", "", 0).
 */
export type Attachment = { driveFileId: string; name: string; mimeType: string; size: number; ownDrive?: boolean };

export type Question = {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  topic: string;
  /** Set on questions another user proposed and the uploader accepted (questionProposals). */
  proposedBy?: { id: string; name: string; /** When the uploader accepted it (ms). Missing on older questions, which count as recent. */ acceptedAt?: number };
};

/**
 * A question someone proposed for a published quiz (usul soal). The material's uploader edits it, then
 * accepts it (it is added to the quiz) or rejects it with an optional reason. Readable only by the proposer
 * and that uploader.
 */
export type QuestionProposal = {
  id: string;
  quizId: string;
  materialId: string;
  courseId: string;
  uploaderId: string;
  materialTitle: string;
  question: Question;
  proposerId: string;
  proposerName: string;
  status: "pending" | "accepted" | "rejected";
  rejectReason?: string;
  createdAt: number;
  reviewedAt?: number;
};

export type Quiz = {
  id: string;
  materialId: string;
  courseId: string;
  title: string;
  status: "draft" | "published";
  questions: Question[];
  createdBy: string;
  createdAt: number;
  generator: "gemini" | "fallback" | "seed";
  reports: number;
};

/**
 * One finished solo practice run (kuis mandiri), stored in practiceAttempts. Only its owner can read it,
 * and it changes no rating or topic stats. `answers` follow `questionIds`; -1 = left empty.
 */
export type PracticeAttempt = {
  id: string;
  uid: string;
  quizId: string;
  materialId: string;
  courseId: string;
  questionIds: string[];
  answers: number[];
  score: number;
  total: number;
  limitMinutes: number;
  usedMs: number;
  createdAt: number;
};

export type DuelSide = {
  answers: number[]; // -1 = timed out
  timesMs: number[];
  score: number;
  totalMs: number;
  finishedAt: number;
};

export type Duel = {
  id: string;
  courseId: string;
  quizId: string;
  quizTitle: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  opponentIsBot?: boolean;
  status: "pending" | "completed" | "declined";
  questions: Question[];
  challenger?: DuelSide;
  opponent?: DuelSide;
  winnerId?: string | null; // null = draw
  eloChange?: { challenger: number; opponent: number };
  declinedAt?: number; // set when the opponent declines a pending challenge (no rating change)
  participants: string[];
  createdAt: number;
};

/** "lainnya" = anything else worth sharing, e.g. open recruitment, internships, campus events. */
export type OpportunityType = "beasiswa" | "lomba" | "seminar" | "lainnya";

export type Opportunity = {
  id: string;
  title: string;
  type: OpportunityType;
  organizer: string;
  majors: string[]; // empty = semua jurusan
  deadline: string; // YYYY-MM-DD
  link: string;
  description: string;
  postedBy: string; // "seed" for the demo samples (read-only)
  createdAt: number;
  updatedAt?: number;
  reports?: number; // missing = 0
};

/** "tanya" = a question; "cari-tim" = looking for teammates (opportunities only). Missing = "tanya". */
export type DiscussionKind = "tanya" | "cari-tim";

/**
 * A discussion (diskusi) attached to exactly one parent: a public material (`materialId`, optionally about one
 * quiz question) or an opportunity (`opportunityId`). Never both. Counts (answers, upvotes) are never stored:
 * they come from per-parent queries (src/lib/discussions.ts). Materials in privateMaterials have no discussions
 * (firestore.rules require materials/{materialId} or opportunities/{opportunityId}).
 */
export type Discussion = {
  id: string;
  /** Parent material (public). Old discussions all have this one. */
  materialId?: string;
  /** Parent opportunity (Hub Peluang). */
  opportunityId?: string;
  /** Materials only: course of the material. */
  courseId?: string;
  /** Materials only: id of a question in quizzes/quiz_{materialId}.questions. Missing = "Umum" (about the material). */
  questionId?: string | null;
  /** Materials only: topic of that quiz question, kept for later filtering. */
  topic?: string | null;
  /** Opportunities only may use "cari-tim". Missing = "tanya". */
  kind?: DiscussionKind;
  title: string;
  /** Markdown + LaTeX. */
  body: string;
  authorId: string;
  authorName: string;
  /** Chosen by the asker or the parent's owner (material uploader / opportunity sharer); null = choice taken back. */
  bestAnswerId?: string | null;
  createdAt: number;
  updatedAt?: number;
  reports: number;
};

/** One answer to a discussion (one level, no replies to answers). Copies its discussion's parent id. */
export type DiscussionAnswer = {
  id: string;
  discussionId: string;
  materialId?: string;
  opportunityId?: string;
  /** Markdown + LaTeX. */
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt?: number;
  reports: number;
};

/**
 * One upvote. Document id: `${targetId}_${uid}`, so a person votes once per target; removing it = deleting the doc.
 * Copies the parent id of what it votes on.
 */
export type DiscussionVote = {
  id: string;
  targetId: string;
  targetType: "discussion" | "answer";
  materialId?: string;
  opportunityId?: string;
  uid: string;
  createdAt: number;
};
