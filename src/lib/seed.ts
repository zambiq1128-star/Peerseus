"use client";
import { db } from "./db";
import { START_ELO } from "./elo";
import type { Course, Material, Membership, Opportunity, Quiz, UserProfile, Question } from "./types";

const SEED_VERSION = 1;

export const COURSES: Course[] = [
  { id: "ma1101", code: "MA1101", name: "Matematika IA", description: "Limit, turunan, dan integral dasar untuk mahasiswa tahun pertama." },
  { id: "fi1101", code: "FI1101", name: "Fisika Dasar IA", description: "Kinematika, dinamika, usaha dan energi." },
  { id: "ki1101", code: "KI1101", name: "Kimia Dasar IA", description: "Struktur atom, ikatan kimia, stoikiometri." },
  { id: "ku1102", code: "KU1102", name: "Pengenalan Komputasi", description: "Dasar pemrograman dan berpikir komputasional." },
];

type BotSeed = { id: string; name: string; major: string; elo: number; stats: Record<string, Record<string, [number, number]>>; contact: string; bio: string };

// Demo peers so the full loop (duel → partner recommendation) can be shown by a single person.
const BOTS: BotSeed[] = [
  { id: "bot_alya", name: "Alya Putri", major: "STEI", elo: 1080, contact: "LINE: alya.demo", bio: "Suka bahas soal limit sambil ngopi.",
    stats: { ma1101: { Limit: [9, 10], Turunan: [6, 10], Kontinuitas: [7, 8] }, fi1101: { Kinematika: [5, 8], "Hukum Newton": [4, 8] } } },
  { id: "bot_bima", name: "Bima Pratama", major: "FTI", elo: 1010, contact: "IG: @bima.demo", bio: "Fokus turunan & aplikasinya.",
    stats: { ma1101: { Limit: [4, 10], Turunan: [9, 10], Kontinuitas: [5, 8] }, fi1101: { Kinematika: [8, 9], "Hukum Newton": [7, 9] } } },
  { id: "bot_citra", name: "Citra Lestari", major: "FMIPA", elo: 960, contact: "WA: 08xx-demo", bio: "Belajar bareng tiap Kamis malam.",
    stats: { ma1101: { Limit: [6, 9], Turunan: [5, 9], Kontinuitas: [8, 9] }, ki1101: { "Struktur Atom": [7, 8] } } },
  { id: "bot_dimas", name: "Dimas Haryanto", major: "FTSL", elo: 1150, contact: "LINE: dimas.demo", bio: "Ambis olim, open buat sparring.",
    stats: { ma1101: { Limit: [9, 10], Turunan: [9, 10], Kontinuitas: [9, 10] }, fi1101: { Kinematika: [9, 10], "Hukum Newton": [9, 10] } } },
  { id: "bot_eka", name: "Eka Wulandari", major: "SITH", elo: 920, contact: "IG: @eka.demo", bio: "Masih adaptasi, yuk belajar pelan-pelan.",
    stats: { ma1101: { Limit: [3, 8], Turunan: [4, 8], Kontinuitas: [3, 6] }, fi1101: { Kinematika: [4, 8], "Hukum Newton": [5, 8] } } },
];

const q = (id: string, topic: string, question: string, options: string[], answerIndex: number, explanation: string): Question =>
  ({ id, topic, question, options, answerIndex, explanation });

const MA_TEXT = `Limit fungsi f(x) ketika x mendekati c adalah nilai L yang didekati f(x) saat x semakin dekat ke c, ditulis lim x→c f(x) = L. Limit ada jika limit kiri dan limit kanan sama.
Untuk bentuk tak tentu 0/0, kita dapat memfaktorkan, merasionalkan, atau memakai aturan L'Hôpital. Contoh: lim x→2 (x²−4)/(x−2) = lim x→2 (x+2) = 4.
Limit trigonometri dasar: lim x→0 sin(x)/x = 1 dan lim x→0 (1−cos x)/x = 0.
Fungsi f kontinu di c jika f(c) terdefinisi, lim x→c f(x) ada, dan lim x→c f(x) = f(c).
Turunan f di x didefinisikan sebagai f'(x) = lim h→0 [f(x+h) − f(x)]/h. Aturan pangkat: d/dx xⁿ = n·xⁿ⁻¹. Aturan rantai: d/dx f(g(x)) = f'(g(x))·g'(x). Aturan hasil kali: (uv)' = u'v + uv'.
Turunan dari sin x adalah cos x, dan turunan dari cos x adalah −sin x. Turunan eˣ adalah eˣ.`;

const MA_QUESTIONS: Question[] = [
  q("q1", "Limit", "Nilai dari lim x→2 (x² − 4)/(x − 2) adalah…", ["0", "2", "4", "Tidak ada"], 2, "Faktorkan: (x−2)(x+2)/(x−2) = x+2, lalu substitusi x=2 menghasilkan 4."),
  q("q2", "Limit", "lim x→0 sin(3x)/x sama dengan…", ["0", "1", "3", "1/3"], 2, "sin(3x)/x = 3·sin(3x)/(3x) → 3·1 = 3."),
  q("q3", "Limit", "Limit suatu fungsi di titik c ada jika…", ["f(c) terdefinisi", "Limit kiri = limit kanan", "f kontinu di seluruh ℝ", "f(c) = 0"], 1, "Syarat keberadaan limit adalah limit kiri dan limit kanan bernilai sama."),
  q("q4", "Kontinuitas", "Fungsi f kontinu di x = c jika…", ["f(c) ada saja", "lim x→c f(x) ada saja", "lim x→c f(x) = f(c)", "f'(c) = 0"], 2, "Kontinu berarti f(c) terdefinisi, limitnya ada, dan keduanya sama."),
  q("q5", "Kontinuitas", "f(x) = (x² − 1)/(x − 1) untuk x ≠ 1 dan f(1) = k. Agar f kontinu di x = 1, k = …", ["0", "1", "2", "−1"], 2, "lim x→1 (x+1) = 2, jadi k harus 2."),
  q("q6", "Turunan", "Turunan dari f(x) = 3x⁴ adalah…", ["12x³", "3x³", "12x⁴", "4x³"], 0, "Aturan pangkat: 3·4·x³ = 12x³."),
  q("q7", "Turunan", "Turunan dari f(x) = sin(2x) adalah…", ["cos(2x)", "2cos(2x)", "−2cos(2x)", "2sin(2x)"], 1, "Aturan rantai: cos(2x)·2."),
  q("q8", "Turunan", "Jika f(x) = x·eˣ, maka f'(x) = …", ["eˣ", "x·eˣ", "eˣ(1 + x)", "eˣ(x − 1)"], 2, "Aturan hasil kali: 1·eˣ + x·eˣ = eˣ(1+x)."),
];

const FI_TEXT = `Kinematika mempelajari gerak tanpa memperhatikan penyebabnya. Pada gerak lurus berubah beraturan (GLBB): v = v₀ + at, s = v₀t + ½at², dan v² = v₀² + 2as.
Hukum I Newton: benda tetap diam atau bergerak lurus beraturan jika resultan gaya nol. Hukum II Newton: ΣF = m·a. Hukum III Newton: setiap aksi menimbulkan reaksi yang sama besar dan berlawanan arah.
Percepatan gravitasi di permukaan bumi sekitar 9,8 m/s².`;

const FI_QUESTIONS: Question[] = [
  q("f1", "Kinematika", "Mobil dari diam dipercepat 2 m/s² selama 5 s. Kecepatan akhirnya…", ["5 m/s", "10 m/s", "20 m/s", "2,5 m/s"], 1, "v = v₀ + at = 0 + 2·5 = 10 m/s."),
  q("f2", "Kinematika", "Jarak yang ditempuh benda pada soal sebelumnya selama 5 s adalah…", ["10 m", "25 m", "50 m", "12,5 m"], 1, "s = ½·2·5² = 25 m."),
  q("f3", "Kinematika", "Grafik v–t berupa garis datar (horizontal) menunjukkan…", ["Percepatan konstan ≠ 0", "Kecepatan konstan", "Benda diam selalu", "Perlambatan"], 1, "v tidak berubah terhadap waktu → GLB."),
  q("f4", "Hukum Newton", "Gaya 10 N bekerja pada massa 2 kg. Percepatannya…", ["20 m/s²", "5 m/s²", "0,2 m/s²", "12 m/s²"], 1, "a = F/m = 10/2 = 5 m/s²."),
  q("f5", "Hukum Newton", "Pasangan aksi–reaksi selalu bekerja pada…", ["Benda yang sama", "Dua benda berbeda", "Benda diam saja", "Arah yang sama"], 1, "Hukum III: aksi dan reaksi bekerja pada dua benda berbeda."),
  q("f6", "Hukum Newton", "Jika resultan gaya pada benda nol, maka benda…", ["Pasti diam", "Dipercepat", "Diam atau bergerak lurus beraturan", "Bergerak melingkar"], 2, "Hukum I Newton (kelembaman)."),
];

const today = () => new Date();
const inDays = (n: number) => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Sample entries only (clearly marked in the UI); real data comes from users.
const OPPS: Omit<Opportunity, "id" | "createdAt" | "postedBy">[] = [
  { title: "Beasiswa Prestasi Mahasiswa Tahun Pertama (contoh)", type: "beasiswa", organizer: "Yayasan Pendidikan (contoh)", majors: [], deadline: inDays(12), link: "https://example.com", description: "Bantuan biaya kuliah satu semester untuk mahasiswa TPB dengan IP ≥ 3,5." },
  { title: "Lomba Karya Tulis Inovasi Teknologi (contoh)", type: "lomba", organizer: "Himpunan Mahasiswa (contoh)", majors: ["STEI", "FTI"], deadline: inDays(20), link: "https://example.com", description: "Tim 2–3 orang, tema teknologi untuk keberlanjutan." },
  { title: "Seminar Riset Sains untuk Mahasiswa Baru (contoh)", type: "seminar", organizer: "Unit Kegiatan Riset (contoh)", majors: ["FMIPA", "SITH"], deadline: inDays(5), link: "https://example.com", description: "Pengenalan cara membaca paper dan menulis laporan praktikum." },
  { title: "Kompetisi Desain Struktur Jembatan (contoh)", type: "lomba", organizer: "Komunitas Sipil (contoh)", majors: ["FTSL"], deadline: inDays(30), link: "https://example.com", description: "Rancang jembatan model dari stik es krim." },
  { title: "Beasiswa Riset Lingkungan (contoh)", type: "beasiswa", organizer: "Lembaga Lingkungan (contoh)", majors: ["SITH", "FTSL", "FMIPA"], deadline: inDays(45), link: "https://example.com", description: "Pendanaan proyek penelitian kecil tentang lingkungan pesisir." },
];

function toStats(s: Record<string, [number, number]> = {}) {
  return Object.fromEntries(Object.entries(s).map(([k, [c, t]]) => [k, { correct: c, total: t }]));
}

export async function ensureSeeded() {
  const meta = await db.get<{ version: number }>("meta", "seed");
  if (meta && meta.version >= SEED_VERSION) return;
  const now = Date.now();

  for (const c of COURSES) await db.set("courses", c.id, c);

  for (const b of BOTS) {
    const courseIds = Object.keys(b.stats);
    const profile: UserProfile = { id: b.id, name: b.name, major: b.major, year: 1, bio: b.bio, contact: b.contact, isPublic: true, isBot: true, courseIds, createdAt: now };
    await db.set("users", b.id, profile);
    for (const cid of courseIds) {
      const m: Membership = { id: `${cid}_${b.id}`, courseId: cid, uid: b.id, name: b.name, major: b.major, isBot: true, elo: b.elo, wins: 0, losses: 0, draws: 0, topicStats: toStats(b.stats[cid]) };
      await db.set("memberships", m.id, m);
    }
  }

  const mats: [Material, Question[]][] = [
    [{ id: "mat_ma_limit", courseId: "ma1101", title: "Ringkasan Limit, Kontinuitas & Turunan", description: "Rangkuman Bab 1–3 untuk persiapan UTS.", topics: ["Limit", "Kontinuitas", "Turunan"], text: MA_TEXT, uploaderId: "bot_dimas", uploaderName: "Dimas Haryanto", createdAt: now - 86400000 * 2, reports: 0 }, MA_QUESTIONS],
    [{ id: "mat_fi_newton", courseId: "fi1101", title: "Kinematika & Hukum Newton", description: "Catatan kuliah minggu 2–4.", topics: ["Kinematika", "Hukum Newton"], text: FI_TEXT, uploaderId: "bot_bima", uploaderName: "Bima Pratama", createdAt: now - 86400000, reports: 0 }, FI_QUESTIONS],
  ];
  for (const [m, qs] of mats) {
    await db.set("materials", m.id, m);
    const quiz: Quiz = { id: `quiz_${m.id}`, materialId: m.id, courseId: m.courseId, title: m.title, status: "published", questions: qs, createdBy: m.uploaderId, createdAt: m.createdAt, generator: "seed", reports: 0 };
    await db.set("quizzes", quiz.id, quiz);
  }

  for (const [i, o] of OPPS.entries()) {
    const id = `opp_seed_${i}`;
    await db.set("opportunities", id, { ...o, id, createdAt: now - i * 3600000, postedBy: "seed" });
  }

  await db.set("meta", "seed", { version: SEED_VERSION });
}

export { START_ELO };
