# Peerseus — Academic Odyssey with your Peers

STACK 2026 (Case 1) project by team Schrodanger's Cat.

One simple loop:

1. **Masuk**: name, faculty and program (or dream program while in TPB) on one screen (ITB Microsoft account, or Google for listed guests, when Firebase is set). For ITB accounts these are prefilled from the NIM in the email and stay editable; codes are in `src/lib/itb.ts`. Then new users land on the **Mata Kuliah** page (`/courses`, also under "Atur mata kuliah" on the home page): semester guessed from the NIM, this semester's courses filled from ITB Kurikulum 2024 (`src/lib/curriculum.ts`), removable, plus search to add any course. Removing a course keeps its rating for when it's added again.
2. **Mata kuliah**: join a course, open its materials, or upload your own (text or PDF) as materi, catatan or past paper, public or private ("Privat, hanya untuk saya"); the course's Materi tab filters by type. The home page shows the 5 newest materials from your courses, marking the ones whose quiz is ready for a duel. **Materiku** (`/materials`, the second tab of Jelajah) lists everything you uploaded. Private materials live in `privateMaterials`, readable only by the uploader, and can't be turned into quizzes.
3. **Kuis**: AI (Gemini) makes 8 multiple-choice questions from a material; the uploader checks them and publishes.
4. **Duel** (live): pick a quiz and an opponent (closest rating preselected) and send an invite. The opponent gets an Accept/Decline banner on any page; the invite expires after 2 minutes and can be cancelled. Once accepted, both screens count down 3-2-1 together and each player answers the same 6 random questions (20 s each) at their own pace, seeing only the opponent's question number. The duel ends when both finish, time runs out, or a player stops answering for 30 s (remaining questions count as wrong). The invite page has two tabs: **Lawan teman** (real people only) and **Lawan bot**, a five-step ladder of practice bots with fixed accuracy and pace per level, themed on Homer's Odyssey ("the way home to Ithaca"): Elpenor (800, ~40%), Polifemus (1000, ~55%), Kirke (1200, ~70%), Skila (1500, ~85%), Poseidon (1800, ~95%). Beating level V shows "Kamu sampai di Ithaca!". All are open from the start; a bot you beat in a course gets a "✓ Sudah dikalahkan" mark. Bots accept and answer by themselves and never change anyone's rating or win/loss count (your answered topics still count). With Firebase, the old demo friends and the ladder bots never appear in opponent lists, rankings or study-partner suggestions; in local demo mode the old demo friends stay (marked "demo").
5. **Hasil**: score, rating change, topics you missed, and study partners strong in those topics (with contact).

Profiles: each person picks what others can see (program, angkatan, contact) on **Profil**, and every signed-in account shows a **✓ ITB** or **Tamu** badge; `/users/[id]` shows a profile as others see it. Hidden fields are stored in `users/{uid}/private/profile`, which `firestore.rules` lets only the owner read (`src/lib/privacy.ts`).

**Jelajah** (`/explore`): browse and search every public material from all courses (title, topic, course or uploader), filter by type (materi, catatan, past paper), and scroll a feed of cards. Its third tab, **Peluang** (`/opportunities`), is the opportunity hub: scholarships, competitions and seminars shared by students, filterable by type and faculty, nearest deadline first, with a detail page that has its own Diskusi (questions, or "Cari tim" posts to find teammates); the nearest three also show on the home page.

Navigation has only three items: Mata Kuliah, Duel, Jelajah. Profile and logout are under your name.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev
```

Open http://localhost:3000.

### Modes

- **Local demo mode** (no Firebase env vars): everything is stored in the browser's localStorage. Demo peers (marked "demo") are seeded so one person can show the full loop: their duel answers are simulated from their topic accuracy. To try a real 2-person live duel, open a second tab of the same browser, log out there and log in with another name: each tab keeps its own account and the tabs see each other's changes. (A private/incognito window does not share demo data.)
- **Firebase mode** (step-by-step in [docs/SETUP.md](docs/SETUP.md)): fill the `NEXT_PUBLIC_FIREBASE_*` vars. Enable **Authentication → Google** and **Firestore**, then deploy `firestore.rules`. Only ITB accounts (Microsoft sign-in, or a verified email, on `itb.ac.id` or a subdomain such as `mahasiswa.itb.ac.id`) and guests listed in Firestore `config/access.guestEmails` (Google sign-in) can use the app: checked at sign-in, in `firestore.rules` for every read/write, and on the AI routes (Firebase ID token verified on the server). Firebase Storage is not used: files are processed in the browser and only the Markdown + LaTeX text is stored. Seed data (courses, demo peers, sample quizzes and opportunities) is written on first login.
- **Peringkat Kontributor**: di tab Peringkat tiap mata kuliah, poin 30 hari terakhir dari jawaban terbaik (5), soal usulan yang diterima (3), materi publik (3), dan upvote untuk jawaban (1), di samping peringkat duel.
- **Streak harian**: hari tercatat kalau kamu menyelesaikan duel (termasuk lawan bot), latihan sendiri, atau menulis jawaban diskusi (upload materi dan login tidak dihitung). Hari dihitung dalam WIB dari jam server. Melewatkan tepat satu hari tidak memutus streak kalau perisai minggu itu belum terpakai (satu perisai per minggu, Senin sampai Minggu); selebihnya streak kembali ke 1. Muncul di bilah atas, kartu di beranda, hasil duel dan latihan, serta profil. Logika murni di `src/lib/streak.ts`, tes dengan `npm test`.
- **Diskusi**: pertanyaan dan jawaban (Markdown + LaTeX) menempel ke materi publik dan soal kuisnya, atau ke peluang di Hub Peluang, dengan jawaban terbaik dan upvote. Di peluang ada juga diskusi "Cari tim" untuk mencari anggota lomba. Dari hasil duel dan latihan ada tautan "Bahas soal ini". Contoh diskusi ada di mode demo.
- **Gemini**: set `GEMINI_API_KEY` (from Google AI Studio). Without it, quiz generation falls back to a simple fill-in-the-blank generator so the flow still works.

## Code map

| Path | What |
| --- | --- |
| `src/lib/db.ts` | Tiny data layer: Firestore or localStorage behind one interface |
| `src/lib/peerseus.ts` | Core logic: courses, quiz generation call, duels, Elo, partner recommendation |
| `src/lib/elo.ts` | Elo rating (K = 32) |
| `src/lib/streak.ts`, `src/lib/activity.ts` | Streak harian: aturan murni (WIB, perisai mingguan) dan `recordActivity` |
| `src/lib/seed.ts` | Seed courses, demo peers, sample materials/quizzes, sample opportunities |
| `src/app/api/generate-quiz/route.ts` | Server route calling Gemini with a JSON schema (low thinking, retries, fallback model) |
| `src/app/api/to-markdown/route.ts` | Transcribes one PDF page image (or one ~4,000-char text part) to Markdown + LaTeX |
| `src/components/MaterialComposer.tsx` | Material input (PDF / .tex / .md / .txt / paste), per-page progress and retry, editor + KaTeX preview |
| `src/lib/gemini.ts` | Shared Gemini call: retry with backoff on 429/5xx, fallback model, deadline, friendly errors |
| `src/lib/access.ts` | Who can sign in: ITB accounts and listed guests; same rule as `firestore.rules` |
| `src/lib/serverAuth.ts` | Verifies the Firebase ID token on the AI routes (Google public keys, no firebase-admin), then ITB account or guest list |
| `src/app/**/page.tsx` | Pages (UI in Bahasa Indonesia) |
| `src/app/globals.css`, `src/components/ui.tsx` | Design tokens, component classes and page building blocks; see [docs/UI.md](docs/UI.md) |

### Partner recommendation score

`0.6 × (their accuracy on my weak topics) + 0.3 × (Elo closeness) + 0.1 × (same faculty)`.
Weak topics come from the duel just played, or topics under 60% accuracy overall.

### Duel winner

Higher score wins; on equal score the faster total time wins (> 0.5 s difference), otherwise a draw.
