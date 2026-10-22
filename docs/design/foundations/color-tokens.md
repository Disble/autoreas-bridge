# Color tokens

Bridge uses HeroUI v3's default tokens with no theme overrides: `frontend/src/style.css` is only
`@import "tailwindcss";` followed by `@import "@heroui/styles";` (the order matters).

## Semantic tokens, never raw values

Tokens in use: `accent`, `success`, `warning`, `danger`, `default`, plus `foreground`, `muted`,
`default-400/500`, `content1`, `divider`. Soft variants exist (`*-soft`, with `*-soft-foreground`).

- Pass `color="success"` (etc.) to HeroUI components. Never hardcode hex or oklch in a component.
- White-alpha utilities (`bg-white/[0.03]`) are used for subtle hover states and surfaces.
- `bg-accent-soft` is NOT a valid utility here; use `bg-accent/10`.
- `Typography` takes only `color="default" | "muted"`; semantic text color goes through a Tailwind
  utility (`className="text-warning"`). See `typography.md`.
- The only place literal hex values are allowed is the chart palette (`chart-palette.md`), because
  `@nivo/bar` cannot read Tailwind classes or HeroUI props.

## Log level to color

Mirrored across the app (`ObservabilityPanel` and `network`):

| Level | Color |
|---|---|
| `info` | `success` |
| `warn` | `warning` |
| `error` | `danger` |
| `debug` | `accent` |
| anything else | `default` |

## Runtime domain to color

| Domain | Color |
|---|---|
| `anime` | `success` |
| `sync` | `accent` |
| `websocket` | `warning` |
| `api` | `danger` |
| `bus` | `default` |
| anything else | `default` |

These mappings live in `*-panel.helpers.ts` (`getNetworkLevelColor`, `getNetworkDomainColor`, and
similar). Reuse the helper; do not re-derive the switch.

## Anime `estado`: canonical labels and colors

Labels are Legacy domain vocabulary (Spanish data literals, like "Sin ver", "Ver hoy", "Visto"):

| `estado` | Label | Color (feature-local) |
|---|---|---|
| 0 | Viendo | `accent` |
| 1 | Finalizado | `success` |
| 2 | No me gusto | `danger` |
| 3 | En pausa | `warning` |

- The wording lives in ONE place: `frontend/src/shared/constants/anime-estado.constants.ts`
  (`ANIME_ESTADO_LABELS`, `ANIME_ESTADO_FILTER_ENTRIES`) and
  `frontend/src/shared/helpers/anime-estado.helpers.ts` (`getAnimeEstadoLabel`). Import labels from
  there and never re-hardcode estado wording in a feature. History, Catalog, AnimeDetail and Chapters
  all consume it — a deliberate, scoped exception to per-feature colocation so a rewording is a
  one-file change. It corrected a three-way drift where estado 2/3 were mislabeled
  "Abandonado"/"Pendiente" (ES) and "Dropped"/"Paused" (EN).
- Estado COLORS stay feature-local (presentation, not vocabulary), following the mapping above.
  Catalog's owner is `getCatalogStatusColor` (`features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts`),
  which colors the soft `estado` chip on every grid card and list row; an unknown value is `default`.

## Brand and action hierarchy

Bridge's brand is HeroUI's token pair, never Legacy's Materialize red/blue.

- **Primary action** — `Button variant="primary"` → `--accent` (`oklch(0.6204 0.195 253.83)`, the
  brand blue). The value is HeroUI's, not ours: `@heroui/styles` 3.2.4 defines `--accent` once, on
  `:root` in `dist/themes/default/variables.css`, and its `.dark` block does not override it, so the
  dark app (`<html class="dark">`) uses the same blue. `style.css` sets no tokens. One per action
  cluster: the action the user came to perform (Today's "+", the Editor's Open schedule editor). A
  primary always keeps its text (an icon may sit beside it); Today's "+" stepper is the one named
  icon-only exception.
- **Secondary action** — `variant="tertiary"`: a gray surface, text or icon-only. Row and card
  actions, and the counterpart of a primary in a paired control (Today's "−").
- **Tertiary action** — `variant="ghost"`: no surface until hover. Disclosures (Show episodes ⌄) and
  field adornments (Browse…).
- **Destructive action** — `variant="tertiary"` with the danger tint on hover (`tone="danger"` on
  `IconActionButton`). Solid `variant="danger"` appears only on the Confirm button of its
  confirmation dialog.
- **HeroUI `secondary` is not a level.** It paints a gray fill with accent text, which reads louder
  than `tertiary` and breaks the order above. Do not use it in new code; existing uses move to
  `tertiary` (or `ghost`) when their surface is touched.
- **Content is an independent axis.** Any level below primary may be text or icon-only; an icon-only
  button always goes through `IconActionButton` (`components/heroui-mapping.md`).
- **Hover tints carry meaning** through semantic utilities: folder → success, page/link → accent,
  status and grade → warning, remove/deactivate → danger. Color on interaction is a UX signal Legacy
  had (green/blue/yellow); port the pattern with Bridge tokens, never Legacy's literal hues.
- When porting Legacy UI, ask "what ROLE does this color play?" and map the role to a Bridge token.
  Copying Legacy hex, or using danger because Legacy used red, is a regression (user-rejected in the
  SDD-38 hotfix cycle).
