# Peerseus — Academic Odyssey with your Peers

STACK 2026 (Case 1) project by team Schrodanger's Cat.

Peerseus links course materials, practice and study partners in one loop:

1. **Course repository**: join a course, browse or upload materials (text, PDF).
2. **AI quiz**: Gemini generates multiple-choice questions from a material; the uploader reviews/edits them before publishing.
3. **Quiz duel**: challenge a peer to a timed duel (6 random questions, 20 s each). Opponents are suggested by closest Elo; results update Elo and the course leaderboard.
4. **After the duel**: see the topics you missed and get study-partner recommendations in the same course (people strong in your weak topics, at a similar level).
5. **Opportunities hub** (supporting): scholarships, competitions and seminars, filterable by type, faculty and deadline.

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
