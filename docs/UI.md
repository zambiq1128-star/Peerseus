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
Top bar:  Peerseus · Mata Kuliah · Duel · Info ............ [first name → Profil]
Page:     PageHeader (← back link, eyebrow, title, description, actions)
          Section (small title + optional action)
          Section ...
```

Page widths (`Page width=...`):

| Width | Token | Routes |
| --- | --- | --- |
| `narrow` | `--container-narrow` | `/courses`, `/profile`, `/users/[id]`, `/duel/new`, `/duel/[id]` |
| `page` (default) | `--container-page` | `/`, `/courses/[id]`, `/materials`, `/materials/[id]`, `/duels`, `/opportunities` |
| `wide` | `--container-wide` | `/courses/[id]/upload`, `/materials/[id]/edit` (editor + preview) |
