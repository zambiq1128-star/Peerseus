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
  year: number;
  bio?: string;
  contact?: string;
  isPublic: boolean;
  /** What other people may read. Missing switch = shown. Hidden fields live in users/{uid}/private/profile (src/lib/privacy.ts). */
  privacy?: Privacy;
  isBot?: boolean;
  courseIds: string[];
  createdAt: number;
};

/** Per-item visibility. showProgram covers `program` and `dreamProgram`. */
export type Privacy = { showProgram?: boolean; showContact?: boolean };

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

/** Kind of material. Missing on materials from before this field: treat as "materi" (see materialType). */
export type MaterialType = "materi" | "catatan" | "paper";

export type Material = {
  id: string;
  courseId: string;
  title: string;
  type?: MaterialType;
  description: string;
  topics: string[];
  text: string;
  /** "markdown" = Markdown + LaTeX (rendered with KaTeX). Missing = old plain-text material. */
  format?: "markdown";
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  uploaderId: string;
  uploaderName: string;
  createdAt: number;
  updatedAt?: number;
  reports: number;
};

export type Question = {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  topic: string;
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
  participants: string[];
  createdAt: number;
};

export type OpportunityType = "beasiswa" | "lomba" | "seminar";

export type Opportunity = {
  id: string;
  title: string;
  type: OpportunityType;
  organizer: string;
  majors: string[]; // empty = semua jurusan
  deadline: string; // YYYY-MM-DD
  link: string;
  description: string;
  postedBy: string;
  createdAt: number;
};
