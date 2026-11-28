import { firebaseEnabled } from "./firebase";
import type { Question } from "./types";

/**
 * Tangga bot ala chess.com: lima rintangan di "perjalanan pulang ke Ithaca" (Odyssey karya Homer; kamu berperan sebagai Odysseus), urut dari mudah ke sulit.
 * Statis, dan tidak punya `memberships`: ratingnya hanya label yang tidak pernah berubah, akurasi dan jeda
 * jawabnya tetap per level untuk semua mata kuliah dan topik. Duel lawan bot selalu Elo 0/0 tanpa menang/kalah.
 * Dokumen `users/bot_*` (isBot: true) dibuat sekali oleh ensureLadderBots() di peerseus.ts, karena
 * firestore.rules mencocokkan `opponentIsBot` dengan `users/{opponentId}.isBot`.
 */
export type LadderBot = {
  id: string;
  name: string;
  /** Angka Romawi untuk ikon monogram (I sampai V), sesuai urutan level. */
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

/**
 * Id `bot_pegasus` dst. SENGAJA dipertahankan walau namanya sudah berganti ke tokoh Odyssey: id itulah yang
 * tersimpan di riwayat duel (`opponentId`) dan di dokumen `users/bot_*`, jadi "✓ Sudah dikalahkan" dan riwayat lama
 * tetap terhubung. Jangan diganti; ubah `name` dan `tagline` saja. Dokumen `users/bot_*` yang lama disamakan
 * oleh ensureLadderBots().
 */
export const LADDER_BOTS: LadderBot[] = [
  { id: "bot_pegasus", name: "Elpenor", initial: "I", level: 1, rating: 800, accuracy: 0.4, pauseSec: [12, 18], tagline: "Awak kapal paling ceroboh, sering salah langkah." },
  { id: "bot_medusa", name: "Polifemus", initial: "II", level: 2, rating: 1000, accuracy: 0.55, pauseSec: [10, 15], tagline: "Raksasa bermata satu: kuat, tapi gampang dikecoh." },
  { id: "bot_minotaur", name: "Kirke", initial: "III", level: 3, rating: 1200, accuracy: 0.7, pauseSec: [8, 13], tagline: "Penyihir cerdik yang suka menjebak jawaban." },
  { id: "bot_athena", name: "Skila", initial: "IV", level: 4, rating: 1500, accuracy: 0.85, pauseSec: [6, 10], tagline: "Monster selat yang jarang membiarkan lawan lolos." },
  { id: "bot_zeus", name: "Poseidon", initial: "V", level: 5, rating: 1800, accuracy: 0.95, pauseSec: [3, 7], tagline: "Dewa laut yang menghadang sampai akhir. Hampir tak pernah salah." },
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

