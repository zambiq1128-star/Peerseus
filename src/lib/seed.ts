"use client";
import { db } from "./db";
import { firebaseEnabled } from "./firebase";
import { START_ELO } from "./elo";
import type { Course, Discussion, DiscussionAnswer, DiscussionVote, Material, Membership, Opportunity, Quiz, UserProfile, Question } from "./types";

// 2: course names follow ITB Kurikulum 2024.
// 3: sample discussions (only added, never removed; existing data is kept).
// 4: sample discussions on the sample opportunities, one of them "Cari tim" (only added, like 3).
const SEED_VERSION = 4;

export const COURSES: Course[] = [
  { id: "ma1101", code: "MA1101", name: "Matematika I", description: "Limit, turunan, dan integral dasar untuk mahasiswa tahun pertama." },
  { id: "fi1101", code: "FI1101", name: "Fisika Dasar I", description: "Kinematika, dinamika, usaha dan energi." },
  { id: "ki1101", code: "KI1101", name: "Kimia Dasar I", description: "Struktur atom, ikatan kimia, stoikiometri." },
  // Was KU1102 Pengenalan Komputasi; Kurikulum 2024 replaced it with WI1102. The id stays so its materials stay.
  { id: "ku1102", code: "WI1102", name: "Berpikir Komputasional", description: "Dasar pemrograman dan berpikir komputasional." },
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
  const done = (await db.get<{ version: number }>("meta", "seed"))?.version ?? 0;
  if (done >= SEED_VERSION) return;
  const now = Date.now();

  for (const c of COURSES) await db.set("courses", c.id, c);
  if (done >= 1) {
    // Already seeded once: only add what is new, so keep demo peers' ratings and the samples.
    if (done < 3) await seedDiscussions(now);
    if (done < 4) await seedOpportunityDiscussions(now);
    await db.set("meta", "seed", { version: SEED_VERSION });
    return;
  }

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
    [{ id: "mat_fi_newton", courseId: "fi1101", title: "Kinematika & Hukum Newton", type: "catatan", description: "Catatan kuliah minggu 2–4.", topics: ["Kinematika", "Hukum Newton"], text: FI_TEXT, uploaderId: "bot_bima", uploaderName: "Bima Pratama", createdAt: now - 86400000, reports: 0 }, FI_QUESTIONS],
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

  await seedDiscussions(now);
  await seedOpportunityDiscussions(now);
  await db.set("meta", "seed", { version: SEED_VERSION });
}

// Sample questions under the seeded materials. Fixed ids, so running it again only rewrites the same samples.
// Votes come from demo peers (never from the author of the item they vote on). Skipped in Firebase mode.
async function seedDiscussions(now: number) {
  // Demo mode only: firestore.rules let people write just their own discussions, answers and votes,
  // so these bot-authored samples would be refused in Firebase mode and break sign-in.
  if (firebaseEnabled) return;
  const day = 86400000;
  const discs: Discussion[] = [
    {
      id: "disc_seed_limit_sin", materialId: "mat_ma_limit", courseId: "ma1101", questionId: "q2", topic: "Limit",
      title: "Kenapa lim sin(3x)/x hasilnya 3?",
      body: "Saya bingung: bukankah sin(0)/0 itu tak tentu? Kenapa bisa langsung 3? Mohon dijelaskan langkahnya, dan apakah rumus $\\lim_{x\\to 0}\\frac{\\sin x}{x}=1$ boleh langsung dipakai?",
      authorId: "bot_eka", authorName: "Eka Wulandari", bestAnswerId: "ans_seed_limit_sin_1",
      createdAt: now - 2 * day, updatedAt: now - day, reports: 0,
    },
    {
      id: "disc_seed_limit_kiri", materialId: "mat_ma_limit", courseId: "ma1101", questionId: null, topic: null,
      title: "Bedanya limit kiri dan limit kanan?",
      body: "Di catatan tertulis limit ada jika limit kiri = limit kanan. Kapan keduanya bisa berbeda? Contoh fungsi tangga biasanya dipakai untuk apa?",
      authorId: "bot_citra", authorName: "Citra Lestari", bestAnswerId: null,
      createdAt: now - day, reports: 0,
    },
    {
      id: "disc_seed_newton_aksi", materialId: "mat_fi_newton", courseId: "fi1101", questionId: "f5", topic: "Hukum Newton",
      title: "Kenapa aksi-reaksi tidak saling meniadakan?",
      body: "Kalau gaya aksi dan reaksinya sama besar dan berlawanan, kenapa benda tetap bisa bergerak? Bukankah keduanya saling meniadakan?",
      authorId: "bot_eka", authorName: "Eka Wulandari", bestAnswerId: null,
      createdAt: now - 6 * 3600000, reports: 0,
    },
  ];

  const answers: DiscussionAnswer[] = [
    {
      id: "ans_seed_limit_sin_1", discussionId: "disc_seed_limit_sin", materialId: "mat_ma_limit",
      body: "Sin(0)/0 memang bentuk tak tentu, jadi kita ubah dulu bentuknya. Kalikan dan bagi dengan 3:\n\n$$\\lim_{x\\to 0}\\frac{\\sin 3x}{x}=\\lim_{x\\to 0}3\\cdot\\frac{\\sin 3x}{3x}$$\n\nMisalkan $u=3x$. Saat $x\\to 0$, juga $u\\to 0$, sehingga $\\lim_{u\\to 0}\\frac{\\sin u}{u}=1$. Jadi hasilnya $3\\cdot 1=3$.\n\nYa, rumus dasar $\\lim_{x\\to 0}\\frac{\\sin x}{x}=1$ boleh dipakai langsung asalkan sudutnya sama dengan penyebutnya.",
      authorId: "bot_alya", authorName: "Alya Putri", createdAt: now - 36 * 3600000, reports: 0,
    },
    {
      id: "ans_seed_limit_sin_2", discussionId: "disc_seed_limit_sin", materialId: "mat_ma_limit",
      body: "Cara lain: pakai aturan L'Hôpital. Turunan pembilang $\\cos 3x\\cdot 3$ dan penyebut $1$, lalu substitusi $x=0$ menghasilkan $3$.",
      authorId: "bot_dimas", authorName: "Dimas Haryanto", createdAt: now - 30 * 3600000, reports: 0,
    },
    {
      id: "ans_seed_limit_kiri_1", discussionId: "disc_seed_limit_kiri", materialId: "mat_ma_limit",
      body: "Limit kiri dan kanan berbeda kalau fungsi melompat di titik itu, misalnya fungsi tangga atau fungsi bilangan bulat terbesar $\\lfloor x\\rfloor$. Di $x=1$, $\\lim_{x\\to 1^-}\\lfloor x\\rfloor=0$ tetapi $\\lim_{x\\to 1^+}\\lfloor x\\rfloor=1$, jadi limitnya tidak ada.",
      authorId: "bot_dimas", authorName: "Dimas Haryanto", createdAt: now - 12 * 3600000, reports: 0,
    },
    {
      id: "ans_seed_newton_aksi_1", discussionId: "disc_seed_newton_aksi", materialId: "mat_fi_newton",
      body: "Gaya aksi-reaksi bekerja pada dua benda yang berbeda, jadi tidak saling meniadakan. Yang menentukan gerak sebuah benda adalah resultan gaya yang bekerja padanya saja: $\\Sigma F = m\\,a$.",
      authorId: "bot_bima", authorName: "Bima Pratama", createdAt: now - 2 * 3600000, reports: 0,
    },
  ];

  const votes: DiscussionVote[] = [
    { id: "disc_seed_limit_sin_bot_citra", targetId: "disc_seed_limit_sin", targetType: "discussion", materialId: "mat_ma_limit", uid: "bot_citra", createdAt: now - day },
    { id: "disc_seed_limit_sin_bot_bima", targetId: "disc_seed_limit_sin", targetType: "discussion", materialId: "mat_ma_limit", uid: "bot_bima", createdAt: now - day },
    { id: "ans_seed_limit_sin_1_bot_citra", targetId: "ans_seed_limit_sin_1", targetType: "answer", materialId: "mat_ma_limit", uid: "bot_citra", createdAt: now - 30 * 3600000 },
    { id: "ans_seed_limit_sin_1_bot_dimas", targetId: "ans_seed_limit_sin_1", targetType: "answer", materialId: "mat_ma_limit", uid: "bot_dimas", createdAt: now - 30 * 3600000 },
    { id: "disc_seed_limit_kiri_bot_alya", targetId: "disc_seed_limit_kiri", targetType: "discussion", materialId: "mat_ma_limit", uid: "bot_alya", createdAt: now - 12 * 3600000 },
  ];

  for (const d of discs) await db.set("discussions", d.id, d);
  for (const a of answers) await db.set("discussionAnswers", a.id, a);
  for (const v of votes) await db.set("discussionVotes", v.id, v);
}

// Sample discussions on the sample opportunities: a "Cari tim" on the competition and a question on the scholarship.
// Same rules as seedDiscussions: fixed ids, demo mode only, votes never by the author. A sample opportunity that
// is gone (local data cleared by hand) simply gets no discussion.
async function seedOpportunityDiscussions(now: number) {
  if (firebaseEnabled) return;
  const hour = 3600000;
  const discs: Discussion[] = [
    {
      id: "disc_seed_opp_tim", opportunityId: "opp_seed_1", kind: "cari-tim",
      title: "Cari 2 anggota, butuh yang bisa desain UI",
      body: "Aku (FTI) sudah punya ide aplikasi pemantau sampah plastik di sungai untuk lomba ini. Cari **2 anggota**:\n\n- 1 orang yang bisa desain UI (Figma)\n- 1 orang yang suka nulis atau riset data\n\nKalau tertarik, balas di sini dengan keahlianmu, nanti aku hubungi lewat kontak di profil.",
      authorId: "bot_bima", authorName: "Bima Pratama", bestAnswerId: null,
      createdAt: now - 20 * hour, reports: 0,
    },
    {
      id: "disc_seed_opp_ip", opportunityId: "opp_seed_0", kind: "tanya",
      title: "IP yang dihitung cuma semester 1?",
      body: "Syaratnya IP ≥ 3,5. Kalau baru selesai semester 1, yang dipakai IP semester itu saja atau nilai rapor SMA juga?",
      authorId: "bot_eka", authorName: "Eka Wulandari", bestAnswerId: "ans_seed_opp_ip_1",
      createdAt: now - 30 * hour, reports: 0,
    },
  ];

  const answers: DiscussionAnswer[] = [
    {
      id: "ans_seed_opp_tim_1", discussionId: "disc_seed_opp_tim", opportunityId: "opp_seed_1",
      body: "Aku tertarik! Biasa bikin desain di Figma untuk tugas STEI, portofolionya ada di profil.",
      authorId: "bot_alya", authorName: "Alya Putri", createdAt: now - 16 * hour, reports: 0,
    },
    {
      id: "ans_seed_opp_ip_1", discussionId: "disc_seed_opp_ip", opportunityId: "opp_seed_0",
      body: "Tahun lalu yang dipakai IP semester 1 saja, rapor SMA tidak diminta. Tetap cek lagi di link pendaftarannya ya.",
      authorId: "bot_citra", authorName: "Citra Lestari", createdAt: now - 26 * hour, reports: 0,
    },
  ];

  const votes: DiscussionVote[] = [
    { id: "disc_seed_opp_tim_bot_dimas", targetId: "disc_seed_opp_tim", targetType: "discussion", opportunityId: "opp_seed_1", uid: "bot_dimas", createdAt: now - 18 * hour },
    { id: "ans_seed_opp_ip_1_bot_eka", targetId: "ans_seed_opp_ip_1", targetType: "answer", opportunityId: "opp_seed_0", uid: "bot_eka", createdAt: now - 25 * hour },
  ];

  const exists = new Set<string>();
  for (const id of new Set(discs.map((d) => d.opportunityId!))) if (await db.get("opportunities", id)) exists.add(id);
  for (const d of discs) if (exists.has(d.opportunityId!)) await db.set("discussions", d.id, d);
  for (const a of answers) if (exists.has(a.opportunityId!)) await db.set("discussionAnswers", a.id, a);
  for (const v of votes) if (exists.has(v.opportunityId!)) await db.set("discussionVotes", v.id, v);
}

export { START_ELO };
