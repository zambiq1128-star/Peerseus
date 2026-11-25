# Peerseus — Academic Odyssey with your Peers

STACK 2026 (Case 1) project by team Schrodanger's Cat.

One simple loop:

1. **Masuk**: name, faculty and program (or dream program while in TPB) on one screen (ITB Microsoft account, or Google for listed guests, when Firebase is set). For ITB accounts these are prefilled from the NIM in the email and stay editable; codes are in `src/lib/itb.ts`. Then new users land on the **Mata Kuliah** page (`/courses`, also under "Atur mata kuliah" on the home page): semester guessed from the NIM, this semester's courses filled from ITB Kurikulum 2024 (`src/lib/curriculum.ts`), removable, plus search to add any course. Removing a course keeps its rating for when it's added again.
2. **Mata kuliah**: join a course, open its materials, or upload your own (text or PDF) as materi, catatan or past paper, public or private ("Privat, hanya untuk saya"); the course's Materi tab filters by type. The home page shows the 5 newest materials from your courses, marking the ones whose quiz is ready for a duel. **Materiku** (`/materials`) lists everything you uploaded. Private materials live in `privateMaterials`, readable only by the uploader, and can't be turned into quizzes.
3. **Kuis**: AI (Gemini) makes 8 multiple-choice questions from a material; the uploader checks them and publishes.
4. **Duel**: one click starts a timed duel (6 questions, 20 s each) against the closest-rated peer.
5. **Hasil**: score, rating change, topics you missed, and study partners strong in those topics (with contact).

Profiles: each person picks what others can see (program, angkatan, contact) on **Profil**, and every signed-in account shows a **✓ ITB** or **Tamu** badge; `/users/[id]` shows a profile as others see it. Hidden fields are stored in `users/{uid}/private/profile`, which `firestore.rules` lets only the owner read (`src/lib/privacy.ts`).

Supporting: **Info** page with scholarships, competitions, seminars and other info (open recruitment, internships, ...), filterable by type, faculty and deadline.

Navigation has only three items: Mata Kuliah, Duel, Info. Profile and logout are under your name.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev
```

Open http://localhost:3000.

### Modes

- **Local demo mode** (no Firebase env vars): everything is stored in the browser's localStorage. Demo peers (marked "demo") are seeded so one person can show the full loop: their duel answers are simulated from their topic accuracy. To try a real 2-person duel, log out and log in with another name in the same browser.
- **Firebase mode** (step-by-step in [docs/SETUP.md](docs/SETUP.md)): fill the `NEXT_PUBLIC_FIREBASE_*` vars. Enable **Authentication → Google** and **Firestore**, then deploy `firestore.rules`. Only ITB accounts (Microsoft sign-in, or a verified email, on `itb.ac.id` or a subdomain such as `mahasiswa.itb.ac.id`) and guests listed in Firestore `config/access.guestEmails` (Google sign-in) can use the app: checked at sign-in, in `firestore.rules` for every read/write, and on the AI routes (Firebase ID token verified on the server). Firebase Storage is not used: files are processed in the browser and only the Markdown + LaTeX text is stored. Seed data (courses, demo peers, sample quizzes and opportunities) is written on first login.
- **Gemini**: set `GEMINI_API_KEY` (from Google AI Studio). Without it, quiz generation falls back to a simple fill-in-the-blank generator so the flow still works.

## Code map

| Path | What |
| --- | --- |
| `src/lib/db.ts` | Tiny data layer: Firestore or localStorage behind one interface |
| `src/lib/peerseus.ts` | Core logic: courses, quiz generation call, duels, Elo, partner recommendation |
| `src/lib/elo.ts` | Elo rating (K = 32) |
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
