# Peerseus — Academic Odyssey with your Peers

STACK 2026 (Case 1) project by team Schrodanger's Cat.

One simple loop:

1. **Masuk**: name + faculty on one screen (Google sign-in when Firebase is set).
2. **Mata kuliah**: join a course, open its materials, or upload your own (text or PDF).
3. **Kuis**: AI (Gemini) makes 8 multiple-choice questions from a material; the uploader checks them and publishes.
4. **Duel**: one click starts a timed duel (6 questions, 20 s each) against the closest-rated peer.
5. **Hasil**: score, rating change, topics you missed, and study partners strong in those topics (with contact).

Supporting: **Info** page with scholarships, competitions and seminars, filterable by type, faculty and deadline.

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
- **Firebase mode** (step-by-step in [docs/SETUP.md](docs/SETUP.md)): fill the `NEXT_PUBLIC_FIREBASE_*` vars. Enable **Authentication → Google**, **Firestore**, and **Storage**, then deploy `firestore.rules` and `storage.rules`. Seed data (courses, demo peers, sample quizzes and opportunities) is written on first login.
- **Gemini**: set `GEMINI_API_KEY` (from Google AI Studio). Without it, quiz generation falls back to a simple fill-in-the-blank generator so the flow still works.

## Code map

| Path | What |
| --- | --- |
| `src/lib/db.ts` | Tiny data layer: Firestore or localStorage behind one interface |
| `src/lib/peerseus.ts` | Core logic: courses, quiz generation call, duels, Elo, partner recommendation |
| `src/lib/elo.ts` | Elo rating (K = 32) |
| `src/lib/seed.ts` | Seed courses, demo peers, sample materials/quizzes, sample opportunities |
| `src/app/api/generate-quiz/route.ts` | Server route calling Gemini with a JSON schema |
| `src/app/**/page.tsx` | Pages (UI in Bahasa Indonesia) |

### Partner recommendation score

`0.6 × (their accuracy on my weak topics) + 0.3 × (Elo closeness) + 0.1 × (same faculty)`.
Weak topics come from the duel just played, or topics under 60% accuracy overall.

### Duel winner

Higher score wins; on equal score the faster total time wins (> 0.5 s difference), otherwise a draw.
