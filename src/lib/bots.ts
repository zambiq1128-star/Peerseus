import { firebaseEnabled } from "./firebase";
import type { Question } from "./types";

/**
 * Tangga bot ala chess.com: lima lawan latihan bertema mitologi Yunani, urut dari mudah ke sulit.
 * Statis, dan tidak punya `memberships`: ratingnya hanya label yang tidak pernah berubah, akurasi dan jeda
 * jawabnya tetap per level untuk semua mata kuliah dan topik. Duel lawan bot selalu Elo 0/0 tanpa menang/kalah.
 * Dokumen `users/bot_*` (isBot: true) dibuat sekali oleh ensureLadderBots() di peerseus.ts, karena
 * firestore.rules mencocokkan `opponentIsBot` dengan `users/{opponentId}.isBot`.
 */
export type LadderBot = {
  id: string;
  name: string;
  /** Satu huruf untuk ikon monogram. */
  initial: string;
  level: number;
  /** Rating tampil (label saja). */
  rating: number;
  /** Peluang menjawab benar, tetap untuk semua topik. */
  accuracy: number;
  /** Jeda sebelum menjawab, dalam detik (min, maks). Selalu di bawah 20 detik. */
  pauseSec: [number, number];
  /** Satu kalimat karakter. */
  tagline: string;
};

export const LADDER_BOTS: LadderBot[] = [
  { id: "bot_pegasus", name: "Pegasus", initial: "P", level: 1, rating: 800, accuracy: 0.4, pauseSec: [12, 18], tagline: "Baru belajar terbang, sering salah arah." },
  { id: "bot_medusa", name: "Medusa", initial: "M", level: 2, rating: 1000, accuracy: 0.55, pauseSec: [10, 15], tagline: "Tatapannya tajam, tapi hitungannya kadang meleset." },
  { id: "bot_minotaur", name: "Minotaur", initial: "T", level: 3, rating: 1200, accuracy: 0.7, pauseSec: [8, 13], tagline: "Hafal seluruh labirin soal, jarang tersesat." },
  { id: "bot_athena", name: "Athena", initial: "A", level: 4, rating: 1500, accuracy: 0.85, pauseSec: [6, 10], tagline: "Strategis dan teliti, hanya sesekali keliru." },
  { id: "bot_zeus", name: "Zeus", initial: "Z", level: 5, rating: 1800, accuracy: 0.95, pauseSec: [3, 7], tagline: "Hampir tak pernah salah, dan cepat." },
];

export const ladderBot = (id: string | undefined | null) => LADDER_BOTS.find((b) => b.id === id) ?? null;
export const isLadderBotId = (id: string | undefined | null) => ladderBot(id) !== null;

/**
 * Teman demo lama (bot_alya, bot_bima, dst. dari seed) dan bot tangga bukan orang sungguhan. Di Firebase keduanya
 * disembunyikan dari daftar lawan, peringkat, rekomendasi teman, dan hitungan anggota; bot tangga hanya
 * muncul di tab "Lawan bot". Di mode demo lokal teman demo lama tetap tampil (tidak ada orang sungguhan).
 */
export function hiddenFromPeople(p: { uid?: string; id?: string; isBot?: boolean }) {
  return isLadderBotId(p.uid ?? p.id) || (firebaseEnabled && !!p.isBot);
}


/** How a ladder bot answers one question: right with its fixed accuracy, after its fixed pause. */
export function ladderAnswer(bot: LadderBot, q: Pick<Question, "answerIndex" | "options">, random: () => number = Math.random) {
  const correct = random() < bot.accuracy;
  const wrong = (q.answerIndex + 1 + Math.floor(random() * (q.options.length - 1))) % q.options.length;
  const [lo, hi] = bot.pauseSec;
  return { answer: correct ? q.answerIndex : wrong, ms: Math.round((lo + random() * (hi - lo)) * 1000), correct };
}

