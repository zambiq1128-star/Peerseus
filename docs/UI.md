# UI kerangka (for restyling)

The current look is a plain skeleton. A new visual design should mostly change values, not pages.

## Where the look lives

| What | Where |
| --- | --- |
| Colors, radius, page widths, font | `@theme` tokens at the top of `src/app/globals.css` |
| Component classes (`card`, `callout`, `btn-primary`, `btn-ghost`, `input`, `label`, `link`, `badge*`, `chip`, `chip-active`, `rows`, `row-link`, `section-title`, `eyebrow`) | `@utility` rules in `src/app/globals.css` |
| Page building blocks (`Page`, `PageHeader`, `Section`, `Spinner`, `Empty`) | `src/components/ui.tsx` |
| Top bar and sign-in screen | `src/components/Shell.tsx` |

Pages use token names only (`bg-surface`, `text-muted`, `rounded-card`, `max-w-page`, ...), never raw colors such as `bg-white` or `bg-red-50`.

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
| `page` (default) | `--container-page` | `/`, `/courses/[id]`, `/materials`, `/materials/[id]`, `/duels`, `/explore` |
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

`CollapsibleRows` (in `ui.tsx`) shows `LIST_LIMIT` (5) rows, then "Lihat semua (N)". It starts collapsed on every visit and is keyed by the active filter so changing a chip collapses it again. Used for Mata kuliah lain, the Materi tab, Materiku, duel history (duels waiting on you are pinned above it) and both lists on a profile. Peringkat uses the same button on a table and keeps your own row visible under the top 5.
