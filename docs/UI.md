# UI kerangka (for restyling)

The look is the Persona blue theme (see "Palet dan peran warna"). A restyle should mostly change values, not pages.

## Where the look lives

| What | Where |
| --- | --- |
| Colors, radius, page widths, font | `@theme` tokens at the top of `src/app/globals.css` |
| Component classes (`card`, `callout`, `btn-primary`, `btn-ghost`, `input`, `label`, `link`, `badge*`, `chip`, `chip-active`, `rows`, `row-link`, `section-title`, `eyebrow`) | `@utility` rules in `src/app/globals.css` |
| Page building blocks (`Page`, `PageHeader`, `Section`, `Spinner`, `Empty`) | `src/components/ui.tsx` |
| Top bar, sign-in logic | `src/components/Shell.tsx` |
| Sign-in screen look (Figma design: hero, logo, tagline, card) | `src/components/Login.tsx` + `Login.module.css` (own colors at the top of the CSS file; sizes are Figma pixels times `--u`) |

Pages use token names only (`bg-surface`, `text-muted`, `rounded-card`, `max-w-page`, ...), never raw colors such as `bg-white` or `bg-red-50`.

## Palet dan peran warna

Tema utama adalah Persona biru. Semua warna lewat token di `@theme` (`src/app/globals.css`); halaman tidak memakai warna mentah.

| Warna | Peran |
| --- | --- |
| `#0a0a0a` | Dasar halaman (hitam) |
| `#040f23` | Midnight: kartu, panel, baris daftar |
| `#1269cc` | Isian: tombol, tab/chip aktif, slab hero, bayangan offset. Teks di atasnya selalu putih (5,4:1) |
| `#00bbfa` | Teks dan ikon aksen (8,9:1 di atas hitam), cincin fokus, skor, tautan |
| `#79d7fd` | Highlight: glow, titik halftone. Dekorasi saja |
| `#6d9ac7` | Teks redup (6,7:1) |
| `#476392` | Garis dan border, hanya non-teks |
| `#ff2e3f` | Merah, HANYA untuk status buruk: duel kalah, jawaban salah, error, duel ditolak, rumus rusak |

Aturan kontras: teks minimal 4,5:1, elemen non-teks minimal 3:1.

Larangan kombinasi:

- Teks putih di atas `#00bbfa` atau `#79d7fd` (hanya 2,2:1 atau lebih rendah). Di atas keduanya pakai teks hitam `#0a0a0a`.
- Teks `#1269cc` di atas hitam (hanya 3,7:1). Biru ini hanya untuk isian.
- Merah untuk hal lain selain status buruk.

Bentuk: heading besar bergaya ransom (`src/components/Ransom.tsx`), kartu bertepi sobek lewat `--p5-cut-a`/`--p5-cut-b`.

Nama token `navy`, `volt`, `cyan`, dan kelas `jrpg-*` adalah nama warisan dari tema JRPG navy/cyan sebelumnya. Namanya sengaja tidak diganti supaya semua halaman tetap mengikuti; nilainya sudah warna Persona biru.

## Page structure

Every signed-in page is the top bar, then one `Page`:

```
Top bar:  Peerseus · Mata Kuliah · Duel · Jelajah ........... [first name → Profil]
Page:     PageHeader (← back link, eyebrow, title, description, actions)
          Section (small title + optional action)
          Section ...
```

Page widths (`Page width=...`):

| Width | Token | Routes |
| --- | --- | --- |
| `narrow` | `--container-narrow` | `/courses`, `/profile`, `/users/[id]`, `/duel/new`, `/duel/[id]` |
| `page` (default) | `--container-page` | `/`, `/courses/[id]`, `/materials`, `/materials/[id]`, `/duels`, `/explore`, `/opportunities`, `/opportunities/[id]` |
| `wide` | `--container-wide` | `/courses/[id]/upload`, `/materials/[id]/edit` (editor + preview) |

## States

Every page that loads data handles three states with the shared blocks in `src/components/ui.tsx`:

| State | Block | Notes |
| --- | --- | --- |
| Loading | `Spinner` | Also the full-screen gate while signing in |
| Empty | `Empty` (`title`, text, `action`) | Says what is missing and offers the next step |
| Error | `ErrorState` (`onRetry`) | Load failed; "Coba lagi" re-runs the load |
| Missing item | `NotFound` | Unknown material, course, duel or user, with a way back; also `src/app/not-found.tsx` |
| Crash | `src/app/error.tsx` | Render error on a page; the top bar stays |

## Motion

Subtle and CSS-only. Tune it in the `@theme` block of `src/app/globals.css`:

| Token | Used for |
| --- | --- |
| `--default-transition-duration`, `--default-transition-timing-function` | Every `transition` / `transition-colors` (hovers, tabs, chips, nav, inputs) |
| `--animate-page-in` | Each `Page` and each course tab fades and lifts in |
| `--animate-row-in` | Leaderboard rows revealed by "Lihat semua" |
| `--animate-pop`, `--animate-shake` | Correct / wrong answer in a duel |
| `--motion-expand`, `--motion-ease` (`:root`) | Collapsible lists sliding open |

`prefers-reduced-motion: reduce` turns all of it off.

## Long lists

`CollapsibleRows` (in `ui.tsx`) shows `LIST_LIMIT` (5) rows, then "Lihat semua (N)". It starts collapsed on every visit and is keyed by the active filter so changing a chip collapses it again. Used for the Materi tab, Materiku, duel history (duels waiting on you are pinned above it) and both lists on a profile. Peringkat uses the same button on a table and keeps your own row visible under the top 5.

## Pair streak badge (streak duel dengan teman)

`PairStreakBadge`, `PairStreakHint`, `PairStreakStats`, `PairStreakResult` in `src/components/Streak.tsx`. ⛵ + number (the "Sekapal", pair streak; 🔥 stays for the personal "Streak") in `text-cyan` (#00bbfa) beside a friend's name (`font-display`, same size as the top-bar streak badge). Nothing renders when the pair streak is not alive (0). "At risk" (last duel yesterday) is only dim text, `text-muted` (#6d9ac7) "Duel hari ini supaya Sekapal nggak putus", never red: red stays for bad status. Inside a `callout` (blue fill, white text: result line, invite text) the number and "+1 hari" stay white; cyan on that fill fails contrast. Load with `usePairStreaks(uid, enabled)` once per page; never per friend.

Row + button layout (e.g. `PartnerList` "Ajak duel", incoming invites on `/duels`): `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`. Text column `min-w-0 flex-1` (may wrap; name, meta and badge flow inline so the badge stays on the name line), button `shrink-0`. Below `sm` the button is always under the text, left aligned (`self-start`); from `sm` it is always at the right, vertically centered.
Text column order in `PartnerList`: line 1 name + Tamu/✓ITB badge as inline text (name, then the badge `ml-2 inline-block whitespace-nowrap align-middle` in a plain block, so it sticks after the last word of the name); line 2 meta (program · angkatan · rating) in `text-xs text-muted`, each piece `whitespace-nowrap` with " · " as the only break point; line 3 reasons, then "Kontak". `academicLabel` never repeats the faculty when the program label already contains its code ("TPB FTI", not "TPB FTI · FTI").
